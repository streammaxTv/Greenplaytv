import type {
  AuthSessionInfo,
  CategoryItem,
  EpisodeItem,
  GlobalSearchResponse,
  HomeCatalogResponse,
  MediaItem,
  MediaType,
  PaginatedCatalogResponse,
  SeasonGroup,
  SeriesDetail,
} from '../types/catalog';

export interface WorkerEnv {
  SESSION_SECRET?: string;
  DEFAULT_LIVE_PLAYLIST_URL?: string;
}

interface SessionTokenPayload {
  mode: 'xtream' | 'm3u';
  serverUrl?: string;
  username?: string;
  password?: string;
  m3uUrl?: string;
  info: AuthSessionInfo;
  exp: number;
}

interface StreamTokenPayload {
  url: string;
  exp: number;
}

interface CachedTypeCatalog {
  categories: CategoryItem[];
  items: MediaItem[];
  fetchedAt: number;
}

const SESSION_TTL_SEC = 12 * 60 * 60; // 12 hours
const STREAM_TOKEN_TTL_SEC = 4 * 60 * 60; // 4 hours
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_M3U_BYTES = 25 * 1024 * 1024; // 25MB cap

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Ephemeral fallback secret per isolate if SESSION_SECRET env var is not yet configured
let isolateFallbackSecretBytes: Uint8Array | null = null;
const memoryCatalogCache = new Map<string, {data: unknown; expiresAt: number}>();

function getFallbackSecretBytes(): Uint8Array {
  if (!isolateFallbackSecretBytes) {
    isolateFallbackSecretBytes = crypto.getRandomValues(new Uint8Array(32));
  }
  return isolateFallbackSecretBytes;
}

async function getAesKey(env: WorkerEnv): Promise<CryptoKey> {
  const rawBytes = env.SESSION_SECRET
    ? textEncoder.encode(env.SESSION_SECRET)
    : getFallbackSecretBytes();
  const keyDigest = await crypto.subtle.digest('SHA-256', new Uint8Array(rawBytes));
  return crypto.subtle.importKey('raw', keyDigest, {name: 'AES-GCM'}, false, [
    'encrypt',
    'decrypt',
  ]);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function encryptToken(payload: object, env: WorkerEnv): Promise<string> {
  const key = await getAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(payload));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, plaintext),
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(encrypted)}`;
}

async function decryptToken<T extends {exp?: number}>(
  token: string,
  env: WorkerEnv,
): Promise<T | null> {
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  try {
    const iv = base64UrlDecode(token.slice(0, dotIdx));
    const ciphertext = base64UrlDecode(token.slice(dotIdx + 1));
    if (iv.length !== 12 || ciphertext.length < 16) return null;
    const key = await getAesKey(env);
    const decrypted = await crypto.subtle.decrypt(
      {name: 'AES-GCM', iv: new Uint8Array(iv)},
      key,
      new Uint8Array(ciphertext),
    );
    const parsed = JSON.parse(textDecoder.decode(decrypted)) as T;
    if (parsed.exp && Math.floor(Date.now() / 1000) > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', textEncoder.encode(input));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- Edge & Memory Caching ---

function getEdgeCache(): Cache | undefined {
  const cfCaches = (globalThis as unknown as {caches?: {default?: Cache}}).caches;
  return cfCaches?.default;
}

async function getCachedJson<T>(cacheKey: string): Promise<T | null> {
  const mem = memoryCatalogCache.get(cacheKey);
  if (mem && mem.expiresAt > Date.now()) {
    return mem.data as T;
  }
  if (mem) {
    memoryCatalogCache.delete(cacheKey);
  }

  const edgeCache = getEdgeCache();
  if (edgeCache) {
    try {
      const hit = await edgeCache.match(new Request(`https://cache.greenplay.internal/${cacheKey}`));
      if (hit) {
        const data = (await hit.json()) as T;
        memoryCatalogCache.set(cacheKey, {data, expiresAt: Date.now() + CACHE_TTL_MS});
        return data;
      }
    } catch {
      // Ignore cache read failures
    }
  }
  return null;
}

async function setCachedJson(cacheKey: string, data: unknown): Promise<void> {
  memoryCatalogCache.set(cacheKey, {data, expiresAt: Date.now() + CACHE_TTL_MS});
  if (memoryCatalogCache.size > 150) {
    const oldestKey = memoryCatalogCache.keys().next().value;
    if (oldestKey) memoryCatalogCache.delete(oldestKey);
  }

  const edgeCache = getEdgeCache();
  if (edgeCache) {
    try {
      const req = new Request(`https://cache.greenplay.internal/${cacheKey}`);
      const res = new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`,
        },
      });
      await edgeCache.put(req, res);
    } catch {
      // Ignore cache write errors
    }
  }
}

// --- SSRF Protection & Safe Fetch ---

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isRestrictedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.arpa') ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }

  // Block numeric/hex/octal obfuscated single-integer IPs
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return true;
  }

  // IPv4 literal check
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return isPrivateOrReservedIpv4(host);
  }

  // IPv6 literal checks
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true;
    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
      return true;
    }
    if (host.startsWith('::ffff:')) {
      const mapped = host.slice(7);
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(mapped)) {
        return isPrivateOrReservedIpv4(mapped);
      }
      return true;
    }
  }

  return false;
}

export async function validateExternalUrl(rawUrl: string): Promise<URL> {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new Error('URL inválida ou muito longa.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Formato de URL inválido. Inclua http:// ou https://.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Apenas protocolos HTTP e HTTPS são permitidos.');
  }

  if (isRestrictedHost(parsed.hostname)) {
    throw new Error('Endereços de rede privada ou local não são permitidos.');
  }

  return parsed;
}

async function safeFetch(
  targetUrl: string,
  options: {timeoutMs?: number; headers?: Record<string, string>; maxRedirects?: number} = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 4;
  let currentUrl = targetUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const validated = await validateExternalUrl(currentUrl);
    const res = await fetch(validated.toString(), {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'GreenPlayTV/1.0',
        Accept: '*/*',
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 15000),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        return res;
      }
      currentUrl = new URL(location, validated).toString();
      continue;
    }
    return res;
  }

  throw new Error('Muitos redirecionamentos no servidor IPTV.');
}

// --- Signed Stream & Image URLs ---

async function createStreamProxyUrl(upstreamUrl: string, env: WorkerEnv): Promise<string> {
  const payload: StreamTokenPayload = {
    url: upstreamUrl,
    exp: Math.floor(Date.now() / 1000) + STREAM_TOKEN_TTL_SEC,
  };
  const signed = await encryptToken(payload, env);
  return `/api/iptv/stream?st=${encodeURIComponent(signed)}`;
}

async function createImageProxyUrl(imageUrl: string, env: WorkerEnv): Promise<string> {
  if (!imageUrl || !imageUrl.trim()) return '';
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (!trimmed.startsWith('http://')) {
    return '';
  }
  const payload: StreamTokenPayload = {
    url: trimmed,
    exp: Math.floor(Date.now() / 1000) + STREAM_TOKEN_TTL_SEC,
  };
  const signed = await encryptToken(payload, env);
  return `/api/iptv/image?st=${encodeURIComponent(signed)}`;
}

// --- M3U Parser ---

function extractAttr(line: string, attr: string): string {
  const re = new RegExp(`${attr}="([^"]*)"`, 'i');
  const m = line.match(re);
  return m ? m[1].trim() : '';
}

function inferM3UType(groupTitle: string, url: string, title: string): MediaType {
  const lowerUrl = url.toLowerCase();
  const lowerGroup = groupTitle.toLowerCase();
  const lowerTitle = title.toLowerCase();

  if (
    lowerUrl.includes('/series/') ||
    /s\d{1,2}\s*e\d{1,2}/i.test(lowerTitle) ||
    lowerGroup.includes('série') ||
    lowerGroup.includes('serie')
  ) {
    return 'series';
  }
  if (
    lowerUrl.includes('/movie/') ||
    /\.(mp4|mkv|avi|mov)(\?|$)/i.test(lowerUrl) ||
    lowerGroup.includes('filme') ||
    lowerGroup.includes('movie') ||
    lowerGroup.includes('vod')
  ) {
    return 'movie';
  }
  return 'live';
}

function slugGroupId(type: MediaType, groupName: string): string {
  const encoded = base64UrlEncode(textEncoder.encode(groupName)).slice(0, 24);
  return `m3u-${type}-${encoded}`;
}

async function parseM3UPlaylist(content: string, env: WorkerEnv) {
  const lines = content.split(/\r?\n/);
  const liveCategoriesMap = new Map<string, CategoryItem>();
  const movieCategoriesMap = new Map<string, CategoryItem>();
  const seriesCategoriesMap = new Map<string, CategoryItem>();

  const liveItems: MediaItem[] = [];
  const movieItems: MediaItem[] = [];
  const seriesItems: MediaItem[] = [];

  let currentMeta: {
    name: string;
    logo: string;
    group: string;
  } | null = null;

  let index = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const commaIdx = line.lastIndexOf(',');
      const displayName = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
      const tvgName = extractAttr(line, 'tvg-name');
      const logo = extractAttr(line, 'tvg-logo');
      const group = extractAttr(line, 'group-title') || 'Geral';
      currentMeta = {
        name: displayName || tvgName || `Canal ${index + 1}`,
        logo,
        group,
      };
      continue;
    }

    if (line.startsWith('#')) continue;

    if (currentMeta && (line.startsWith('http://') || line.startsWith('https://'))) {
      index += 1;
      const type = inferM3UType(currentMeta.group, line, currentMeta.name);
      const catId = slugGroupId(type, currentMeta.group);
      const itemId = `m3u-${index}`;
      const poster = await createImageProxyUrl(currentMeta.logo, env);
      const format: 'hls' | 'mp4' | 'ts' = /\.m3u8(\?|$)/i.test(line)
        ? 'hls'
        : /\.(mp4|mkv|webm)(\?|$)/i.test(line)
          ? 'mp4'
          : 'ts';

      const mediaItem: MediaItem = {
        id: itemId,
        type,
        title: currentMeta.name,
        description:
          type === 'live'
            ? `Transmissão ao vivo na categoria ${currentMeta.group}.`
            : `Conteúdo da lista conectada na categoria ${currentMeta.group}.`,
        poster,
        banner: poster,
        genres: [currentMeta.group],
        categoryId: catId,
        categoryName: currentMeta.group,
        channelNumber: type === 'live' ? liveItems.length + 1 : undefined,
        streamUrl: await createStreamProxyUrl(line, env),
        streamFormat: format,
      };

      if (type === 'live') {
        if (!liveCategoriesMap.has(catId)) {
          liveCategoriesMap.set(catId, {id: catId, name: currentMeta.group, type: 'live'});
        }
        liveItems.push(mediaItem);
      } else if (type === 'movie') {
        if (!movieCategoriesMap.has(catId)) {
          movieCategoriesMap.set(catId, {id: catId, name: currentMeta.group, type: 'movie'});
        }
        movieItems.push(mediaItem);
      } else {
        if (!seriesCategoriesMap.has(catId)) {
          seriesCategoriesMap.set(catId, {id: catId, name: currentMeta.group, type: 'series'});
        }
        seriesItems.push(mediaItem);
      }
      currentMeta = null;
    }
  }

  return {
    live: {categories: [...liveCategoriesMap.values()], items: liveItems, fetchedAt: Date.now()},
    movie: {categories: [...movieCategoriesMap.values()], items: movieItems, fetchedAt: Date.now()},
    series: {categories: [...seriesCategoriesMap.values()], items: seriesItems, fetchedAt: Date.now()},
  };
}

// --- Xtream Codes Helpers ---

function formatDurationMinutes(value: unknown): {label?: string; seconds?: number} {
  if (!value) return {};
  const str = String(value).trim();
  if (!str) return {};

  if (/^\d+:\d{2}(:\d{2})?$/.test(str)) {
    const parts = str.split(':').map(Number);
    let totalSec = 0;
    if (parts.length === 3) totalSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) totalSec = parts[0] * 60 + parts[1];
    if (totalSec <= 0) return {};
    const mins = Math.round(totalSec / 60);
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return {
      seconds: totalSec,
      label: hrs > 0 ? `${hrs}h ${rem}m` : `${mins} min`,
    };
  }

  const num = Number(str);
  if (!Number.isNaN(num) && num > 0) {
    const totalSec = num > 600 ? num : num * 60;
    const mins = Math.round(totalSec / 60);
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return {
      seconds: totalSec,
      label: hrs > 0 ? `${hrs}h ${rem}m` : `${mins} min`,
    };
  }
  return {};
}

function extractYear(raw: unknown): string | undefined {
  if (!raw) return undefined;
  const match = String(raw).match(/(19\d{2}|20\d{2})/);
  return match ? match[1] : undefined;
}

async function xtreamCall<T>(
  session: SessionTokenPayload,
  action: string,
  extraParams: Record<string, string> = {},
): Promise<T> {
  if (!session.serverUrl || !session.username || !session.password) {
    throw new Error('Sessão Xtream Codes inválida.');
  }
  const url = new URL(`${session.serverUrl}/player_api.php`);
  url.searchParams.set('username', session.username);
  url.searchParams.set('password', session.password);
  if (action) url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(extraParams)) {
    url.searchParams.set(k, v);
  }
  const res = await safeFetch(url.toString(), {timeoutMs: 18000});
  if (!res.ok) {
    throw new Error(`O servidor IPTV respondeu com erro (${res.status}).`);
  }
  return (await res.json()) as T;
}

async function getSessionScopeHash(session: SessionTokenPayload): Promise<string> {
  const identity =
    session.mode === 'm3u'
      ? `m3u:${session.m3uUrl || ''}`
      : `xtream:${session.serverUrl || ''}:${session.username || ''}`;
  return sha256Hex(identity);
}

async function loadCatalogForType(
  session: SessionTokenPayload,
  type: MediaType,
  env: WorkerEnv,
): Promise<CachedTypeCatalog> {
  const scopeHash = await getSessionScopeHash(session);
  const cacheKey = `cat-${scopeHash}-${type}`;
  const cached = await getCachedJson<CachedTypeCatalog>(cacheKey);
  if (cached) {
    return cached;
  }

  if (session.mode === 'm3u') {
    if (!session.m3uUrl) {
      return {categories: [], items: [], fetchedAt: Date.now()};
    }
    const res = await safeFetch(session.m3uUrl, {timeoutMs: 20000});
    if (!res.ok) {
      throw new Error(`Não foi possível acessar a lista M3U (HTTP ${res.status}).`);
    }
    const text = await res.text();
    const parsed = await parseM3UPlaylist(text, env);
    await Promise.all([
      setCachedJson(`cat-${scopeHash}-live`, parsed.live),
      setCachedJson(`cat-${scopeHash}-movie`, parsed.movie),
      setCachedJson(`cat-${scopeHash}-series`, parsed.series),
    ]);
    return parsed[type];
  }

  const catAction =
    type === 'live'
      ? 'get_live_categories'
      : type === 'movie'
        ? 'get_vod_categories'
        : 'get_series_categories';

  const streamAction =
    type === 'live'
      ? 'get_live_streams'
      : type === 'movie'
        ? 'get_vod_streams'
        : 'get_series';

  const [rawCats, rawItems] = await Promise.all([
    xtreamCall<Array<{category_id: string | number; category_name: string}>>(session, catAction).catch(
      () => [],
    ),
    xtreamCall<Array<Record<string, unknown>>>(session, streamAction).catch(() => []),
  ]);

  const categories: CategoryItem[] = Array.isArray(rawCats)
    ? rawCats.map((c) => ({
        id: String(c.category_id),
        name: String(c.category_name || 'Sem categoria').trim(),
        type,
      }))
    : [];

  const catNameById = new Map(categories.map((c) => [c.id, c.name]));

  const rawList = Array.isArray(rawItems) ? rawItems : [];
  const items: MediaItem[] = await Promise.all(
    rawList.map(async (raw, idx) => {
      const id = String(
        type === 'series' ? (raw.series_id ?? raw.id ?? idx) : (raw.stream_id ?? raw.id ?? idx),
      );
      const categoryId = String(raw.category_id ?? '');
      const categoryName = catNameById.get(categoryId) || 'Catálogo';
      const title = String(raw.name || raw.title || `Item ${idx + 1}`).trim();
      const rawCover = String(raw.stream_icon || raw.cover || '');
      const poster = await createImageProxyUrl(rawCover, env);
      const backdropList = Array.isArray(raw.backdrop_path) ? raw.backdrop_path : [];
      const rawBanner = backdropList[0] ? String(backdropList[0]) : rawCover;
      const banner = (await createImageProxyUrl(rawBanner, env)) || poster;
      const genres = raw.genre
        ? String(raw.genre)
            .split(/[,/|]/)
            .map((g) => g.trim())
            .filter(Boolean)
        : [categoryName];
      const year = extractYear(raw.releaseDate || raw.year || raw.added || title);
      const ratingVal = raw.rating ? String(raw.rating).trim() : undefined;

      let streamUrl: string | undefined;
      let streamFormat: 'hls' | 'mp4' | 'ts' | undefined;
      if (type === 'live' && session.serverUrl && session.username && session.password) {
        const upstream = `${session.serverUrl}/live/${encodeURIComponent(session.username)}/${encodeURIComponent(session.password)}/${encodeURIComponent(id)}.m3u8`;
        streamUrl = await createStreamProxyUrl(upstream, env);
        streamFormat = 'hls';
      } else if (type === 'movie' && session.serverUrl && session.username && session.password) {
        const ext = String(raw.container_extension || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4';
        const upstream = `${session.serverUrl}/movie/${encodeURIComponent(session.username)}/${encodeURIComponent(session.password)}/${encodeURIComponent(id)}.${ext}`;
        streamUrl = await createStreamProxyUrl(upstream, env);
        streamFormat = ext === 'm3u8' ? 'hls' : 'mp4';
      }

      return {
        id,
        type,
        title,
        description: String(raw.plot || raw.description || '').trim(),
        poster,
        banner,
        genres: genres.length ? genres : [categoryName],
        categoryId,
        categoryName,
        year,
        rating: ratingVal && ratingVal !== '0' ? ratingVal : undefined,
        channelNumber: type === 'live' ? Number(raw.num || idx + 1) : undefined,
        streamUrl,
        streamFormat,
      };
    }),
  );

  const result: CachedTypeCatalog = {
    categories,
    items,
    fetchedAt: Date.now(),
  };
  await setCachedJson(cacheKey, result);
  return result;
}

// --- Response Helpers ---

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function resolveSession(
  request: Request,
  env: WorkerEnv,
): Promise<SessionTokenPayload | null> {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return decryptToken<SessionTokenPayload>(token, env);
}

// --- Main Fetch Router ---

export async function handleApiRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  try {
    // Health check
    if (pathname === '/api/health' && method === 'GET') {
      return jsonResponse({status: 'ok'});
    }

    // Xtream Codes Auth
    if (pathname === '/api/auth/xtream' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {
        serverUrl?: string;
        username?: string;
        password?: string;
      };
      if (!body.serverUrl || !body.username || !body.password) {
        return jsonResponse({error: 'Informe a URL do servidor, usuário e senha.'}, 400);
      }

      const normalizedBase = body.serverUrl.trim().replace(/\/+$/, '');
      const parsedUrl = await validateExternalUrl(normalizedBase);
      const baseOrigin = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname === '/' ? '' : parsedUrl.pathname}`;

      const authUrl = new URL(`${baseOrigin}/player_api.php`);
      authUrl.searchParams.set('username', body.username.trim());
      authUrl.searchParams.set('password', body.password);

      const upstreamRes = await safeFetch(authUrl.toString(), {timeoutMs: 12000});
      if (!upstreamRes.ok) {
        return jsonResponse(
          {error: `O provedor IPTV recusou a conexão (HTTP ${upstreamRes.status}).`},
          401,
        );
      }

      let data: {
        user_info?: {
          auth?: number | string;
          status?: string;
          exp_date?: string | null;
          max_connections?: string | number;
          active_cons?: string | number;
          username?: string;
        };
      };
      try {
        data = (await upstreamRes.json()) as typeof data;
      } catch {
        return jsonResponse(
          {error: 'O endereço informado não retornou uma API Xtream Codes válida.'},
          400,
        );
      }

      const userInfo = data?.user_info;
      if (!userInfo || String(userInfo.auth) !== '1') {
        return jsonResponse({error: 'Usuário ou senha IPTV inválidos.'}, 401);
      }

      const status = String(userInfo.status || 'Active');
      if (status.toLowerCase() !== 'active') {
        return jsonResponse(
          {error: `Conta IPTV com status "${status}". Verifique a validade com seu provedor.`},
          403,
        );
      }

      let expiresAt: string | undefined;
      if (userInfo.exp_date && /^\d+$/.test(String(userInfo.exp_date))) {
        const ts = Number(userInfo.exp_date) * 1000;
        if (ts > 0) {
          expiresAt = new Date(ts).toLocaleDateString('pt-BR');
        }
      }

      const info: AuthSessionInfo = {
        authenticated: true,
        mode: 'xtream',
        accountLabel: String(userInfo.username || body.username.trim()),
        serverHost: parsedUrl.host,
        status: 'Ativa',
        expiresAt,
        maxConnections: userInfo.max_connections ? String(userInfo.max_connections) : undefined,
        activeConnections: userInfo.active_cons ? String(userInfo.active_cons) : undefined,
        capabilities: {live: true, movies: true, series: true},
      };

      const tokenPayload: SessionTokenPayload = {
        mode: 'xtream',
        serverUrl: baseOrigin,
        username: body.username.trim(),
        password: body.password,
        info,
        exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
      };
      const token = await encryptToken(tokenPayload, env);
      return jsonResponse({token, session: info});
    }

    // M3U URL Auth
    if (pathname === '/api/auth/m3u' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {m3uUrl?: string};
      if (!body.m3uUrl || !body.m3uUrl.trim()) {
        return jsonResponse({error: 'Informe a URL completa da lista M3U.'}, 400);
      }

      const parsed = await validateExternalUrl(body.m3uUrl);
      const upstreamRes = await safeFetch(parsed.toString(), {timeoutMs: 20000});
      if (!upstreamRes.ok) {
        return jsonResponse(
          {error: `Não foi possível acessar a lista M3U (HTTP ${upstreamRes.status}).`},
          401,
        );
      }

      const contentLength = Number(upstreamRes.headers.get('content-length') || 0);
      if (contentLength > MAX_M3U_BYTES) {
        return jsonResponse({error: 'A lista M3U excede o limite de tamanho suportado.'}, 413);
      }

      const text = await upstreamRes.text();
      if (textEncoder.encode(text).length > MAX_M3U_BYTES) {
        return jsonResponse({error: 'A lista M3U excede o limite de tamanho suportado.'}, 413);
      }
      if (!text.includes('#EXTM3U') && !text.includes('#EXTINF')) {
        return jsonResponse(
          {error: 'O link informado não contém uma playlist M3U válida.'},
          400,
        );
      }

      const parsedCatalog = await parseM3UPlaylist(text, env);
      const totalCount =
        parsedCatalog.live.items.length +
        parsedCatalog.movie.items.length +
        parsedCatalog.series.items.length;

      if (totalCount === 0) {
        return jsonResponse(
          {error: 'Nenhum canal ou conteúdo válido encontrado na lista M3U.'},
          400,
        );
      }

      const info: AuthSessionInfo = {
        authenticated: true,
        mode: 'm3u',
        accountLabel: `Lista M3U (${parsed.hostname})`,
        serverHost: parsed.host,
        status: 'Conectada',
        capabilities: {
          live: parsedCatalog.live.items.length > 0,
          movies: parsedCatalog.movie.items.length > 0,
          series: parsedCatalog.series.items.length > 0,
        },
      };

      const tokenPayload: SessionTokenPayload = {
        mode: 'm3u',
        m3uUrl: parsed.toString(),
        info,
        exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
      };
      const scopeHash = await getSessionScopeHash(tokenPayload);
      await Promise.all([
        setCachedJson(`cat-${scopeHash}-live`, parsedCatalog.live),
        setCachedJson(`cat-${scopeHash}-movie`, parsedCatalog.movie),
        setCachedJson(`cat-${scopeHash}-series`, parsedCatalog.series),
      ]);

      const token = await encryptToken(tokenPayload, env);
      return jsonResponse({token, session: info});
    }

    if (pathname === '/api/auth/session' && method === 'GET') {
      const session = await resolveSession(request, env);
      if (!session) return jsonResponse({authenticated: false});
      return jsonResponse(session.info);
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      return jsonResponse({ok: true});
    }

    // Owner-configured optional Live TV playlist
    if (pathname === '/api/iptv/owner-live' && method === 'GET') {
      const ownerUrl = env.DEFAULT_LIVE_PLAYLIST_URL?.trim();
      if (!ownerUrl) {
        return jsonResponse({configured: false, categories: [], channels: []});
      }
      try {
        const validated = await validateExternalUrl(ownerUrl);
        const upstreamRes = await safeFetch(validated.toString(), {timeoutMs: 15000});
        if (!upstreamRes.ok) {
          return jsonResponse({configured: true, error: 'Falha ao carregar playlist configurada.'}, 502);
        }
        const text = await upstreamRes.text();
        const parsed = await parseM3UPlaylist(text, env);
        return jsonResponse({
          configured: true,
          categories: parsed.live.categories,
          channels: parsed.live.items,
        });
      } catch {
        return jsonResponse({configured: true, error: 'Erro ao conectar à playlist ao vivo.'}, 502);
      }
    }

    // Stream proxy
    if (pathname === '/api/iptv/stream' && method === 'GET') {
      const st = url.searchParams.get('st') || '';
      const payload = await decryptToken<StreamTokenPayload>(st, env);
      if (!payload?.url) {
        return jsonResponse({error: 'Token de reprodução inválido ou expirado.'}, 401);
      }

      const headers: Record<string, string> = {};
      const rangeHeader = request.headers.get('range');
      if (rangeHeader) {
        headers.Range = rangeHeader;
      }

      const upstreamRes = await safeFetch(payload.url, {timeoutMs: 20000, headers});
      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        return jsonResponse({error: 'Fonte de vídeo indisponível no provedor.'}, upstreamRes.status);
      }

      const contentType = upstreamRes.headers.get('content-type') || '';
      const isHlsManifest =
        contentType.includes('mpegurl') || payload.url.toLowerCase().includes('.m3u8');

      if (isHlsManifest) {
        const manifestText = await upstreamRes.text();
        const baseUrl = upstreamRes.url || payload.url;
        const lines = manifestText.split(/\r?\n/);
        const rewrittenLines = await Promise.all(
          lines.map(async (line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) {
              const matches = [...line.matchAll(/URI="([^"]+)"/g)];
              if (matches.length === 0) return line;
              let nextLine = line;
              for (const m of matches) {
                try {
                  const abs = new URL(m[1], baseUrl).toString();
                  const proxied = await createStreamProxyUrl(abs, env);
                  nextLine = nextLine.replace(m[0], `URI="${proxied}"`);
                } catch {
                  // Keep original URI if unparseable
                }
              }
              return nextLine;
            }
            try {
              const abs = new URL(trimmed, baseUrl).toString();
              return await createStreamProxyUrl(abs, env);
            } catch {
              return line;
            }
          }),
        );

        return new Response(rewrittenLines.join('\n'), {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      }

      const responseHeaders = new Headers();
      if (contentType) responseHeaders.set('Content-Type', contentType);
      const contentLength = upstreamRes.headers.get('content-length');
      if (contentLength) responseHeaders.set('Content-Length', contentLength);
      const contentRange = upstreamRes.headers.get('content-range');
      if (contentRange) responseHeaders.set('Content-Range', contentRange);
      const acceptRanges = upstreamRes.headers.get('accept-ranges');
      if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);
      responseHeaders.set('Cache-Control', 'no-store');

      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    }

    // Image proxy for HTTP provider covers
    if (pathname === '/api/iptv/image' && method === 'GET') {
      const st = url.searchParams.get('st') || '';
      const payload = await decryptToken<StreamTokenPayload>(st, env);
      if (!payload?.url) {
        return new Response(null, {status: 404});
      }
      try {
        const upstreamRes = await safeFetch(payload.url, {timeoutMs: 8000});
        if (!upstreamRes.ok || !upstreamRes.body) {
          return new Response(null, {status: 404});
        }
        const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
        if (!contentType.startsWith('image/')) {
          return new Response(null, {status: 400});
        }
        return new Response(upstreamRes.body, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
          },
        });
      } catch {
        return new Response(null, {status: 404});
      }
    }

    // Authenticated Catalog Routes
    const session = await resolveSession(request, env);
    if (!session) {
      return jsonResponse(
        {error: 'Sessão não autenticada ou expirada. Conecte sua lista IPTV.'},
        401,
      );
    }

    // Home feed
    if (pathname === '/api/iptv/home' && method === 'GET') {
      const [moviesRes, seriesRes, liveRes] = await Promise.allSettled([
        loadCatalogForType(session, 'movie', env),
        loadCatalogForType(session, 'series', env),
        loadCatalogForType(session, 'live', env),
      ]);

      const moviesCat =
        moviesRes.status === 'fulfilled' ? moviesRes.value : {categories: [], items: []};
      const seriesCat =
        seriesRes.status === 'fulfilled' ? seriesRes.value : {categories: [], items: []};
      const liveCat =
        liveRes.status === 'fulfilled' ? liveRes.value : {categories: [], items: []};

      const featured = moviesCat.items[0] || seriesCat.items[0] || liveCat.items[0] || null;
      const popularMovies = moviesCat.items.slice(0, 18);
      const popularSeries = seriesCat.items.slice(0, 18);
      const liveChannels = liveCat.items.slice(0, 18);
      const recentlyAdded = [
        ...moviesCat.items.slice(-8).reverse(),
        ...seriesCat.items.slice(-8).reverse(),
      ].slice(0, 16);

      const response: HomeCatalogResponse = {
        featured,
        liveChannels,
        popularMovies,
        popularSeries,
        recentlyAdded,
        categories: {
          movies: moviesCat.categories.slice(0, 24),
          series: seriesCat.categories.slice(0, 24),
          live: liveCat.categories.slice(0, 24),
        },
      };
      return jsonResponse(response);
    }

    // Paginated catalog
    if (pathname === '/api/iptv/catalog' && method === 'GET') {
      const rawType = url.searchParams.get('type') || 'movie';
      if (rawType !== 'movie' && rawType !== 'series' && rawType !== 'live') {
        return jsonResponse({error: 'Tipo de catálogo inválido.'}, 400);
      }

      const catalog = await loadCatalogForType(session, rawType, env);
      const categoryId = url.searchParams.get('categoryId') || 'all';
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const genre = (url.searchParams.get('genre') || 'all').trim().toLowerCase();
      const year = (url.searchParams.get('year') || 'all').trim();
      const sort = url.searchParams.get('sort') || 'default';
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
      const limit = Math.min(80, Math.max(12, Number(url.searchParams.get('limit')) || 36));

      const yearsSet = new Set<string>();
      const genresSet = new Set<string>();
      for (const item of catalog.items) {
        if (item.year) yearsSet.add(item.year);
        for (const g of item.genres) genresSet.add(g);
      }

      let filtered = catalog.items;
      if (categoryId !== 'all') {
        filtered = filtered.filter((item) => item.categoryId === categoryId);
      }
      if (genre !== 'all') {
        filtered = filtered.filter((item) =>
          item.genres.some((g) => g.toLowerCase() === genre),
        );
      }
      if (year !== 'all') {
        filtered = filtered.filter((item) => item.year === year);
      }
      if (q) {
        filtered = filtered.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.genres.some((g) => g.toLowerCase().includes(q)),
        );
      }

      if (sort === 'title_asc') {
        filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
      } else if (sort === 'title_desc') {
        filtered = [...filtered].sort((a, b) => b.title.localeCompare(a.title, 'pt-BR'));
      } else if (sort === 'year_desc') {
        filtered = [...filtered].sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
      } else if (sort === 'recent') {
        filtered = [...filtered].reverse();
      }

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * limit;
      const paged = filtered.slice(start, start + limit);

      const response: PaginatedCatalogResponse = {
        items: paged,
        total,
        page: safePage,
        totalPages,
        categories: catalog.categories,
        years: [...yearsSet].sort((a, b) => Number(b) - Number(a)),
        genres: [...genresSet].slice(0, 40),
      };
      return jsonResponse(response);
    }

    // Item Detail (/api/iptv/item/:type/:id)
    const itemMatch = pathname.match(/^\/api\/iptv\/item\/([^/]+)\/([^/]+)$/);
    if (itemMatch && method === 'GET') {
      const type = decodeURIComponent(itemMatch[1]);
      const id = decodeURIComponent(itemMatch[2]);
      if (type !== 'movie' && type !== 'series' && type !== 'live') {
        return jsonResponse({error: 'Tipo inválido.'}, 400);
      }

      const catalog = await loadCatalogForType(session, type, env);
      const baseItem = catalog.items.find((i) => i.id === id);
      if (!baseItem) {
        return jsonResponse({error: 'Conteúdo não encontrado na sua lista.'}, 404);
      }

      const related = catalog.items
        .filter((i) => i.id !== id && i.categoryId === baseItem.categoryId)
        .slice(0, 12);

      const scopeHash = await getSessionScopeHash(session);

      if (type === 'movie') {
        if (session.mode === 'xtream') {
          const detailKey = `mov-${scopeHash}-${id}`;
          const cached = await getCachedJson<MediaItem>(detailKey);
          if (cached) {
            return jsonResponse({item: cached, related});
          }
          try {
            const vodInfo = await xtreamCall<{
              info?: Record<string, unknown>;
              movie_data?: Record<string, unknown>;
            }>(session, 'get_vod_info', {vod_id: id});
            const info = vodInfo?.info || {};
            const movieData = vodInfo?.movie_data || {};
            const dur = formatDurationMinutes(info.duration || info.duration_secs);
            const backdropList = Array.isArray(info.backdrop_path) ? info.backdrop_path : [];
            const bannerRaw = backdropList[0]
              ? String(backdropList[0])
              : String(info.movie_image || '');
            const enriched: MediaItem = {
              ...baseItem,
              description: String(info.plot || info.description || baseItem.description || '').trim(),
              banner:
                (await createImageProxyUrl(bannerRaw, env)) ||
                baseItem.banner ||
                baseItem.poster,
              poster:
                (await createImageProxyUrl(String(info.movie_image || ''), env)) ||
                baseItem.poster,
              year: extractYear(info.releasedate || info.releaseDate) || baseItem.year,
              duration: dur.label || baseItem.duration,
              durationSeconds: dur.seconds || baseItem.durationSeconds,
              genres: info.genre
                ? String(info.genre)
                    .split(/[,/|]/)
                    .map((g) => g.trim())
                    .filter(Boolean)
                : baseItem.genres,
              rating: info.rating ? String(info.rating) : baseItem.rating,
            };
            if (
              movieData.container_extension &&
              session.serverUrl &&
              session.username &&
              session.password
            ) {
              const ext =
                String(movieData.container_extension).replace(/[^a-z0-9]/gi, '') || 'mp4';
              const upstream = `${session.serverUrl}/movie/${encodeURIComponent(session.username)}/${encodeURIComponent(session.password)}/${encodeURIComponent(id)}.${ext}`;
              enriched.streamUrl = await createStreamProxyUrl(upstream, env);
              enriched.streamFormat = ext === 'm3u8' ? 'hls' : 'mp4';
            }
            await setCachedJson(detailKey, enriched);
            return jsonResponse({item: enriched, related});
          } catch {
            // Fall back to baseItem
          }
        }
        return jsonResponse({item: baseItem, related});
      }

      if (type === 'series') {
        if (session.mode === 'xtream') {
          const detailKey = `ser-${scopeHash}-${id}`;
          const cached = await getCachedJson<SeriesDetail>(detailKey);
          if (cached) {
            return jsonResponse({item: cached, related});
          }
          try {
            const seriesData = await xtreamCall<{
              info?: Record<string, unknown>;
              episodes?: Record<string, Array<Record<string, unknown>>>;
              seasons?: Array<Record<string, unknown>>;
            }>(session, 'get_series_info', {series_id: id});

            const info = seriesData?.info || {};
            const rawEpisodesBySeason = seriesData?.episodes || {};
            const seasonMetaList = Array.isArray(seriesData?.seasons) ? seriesData.seasons : [];

            const seasons: SeasonGroup[] = await Promise.all(
              Object.entries(rawEpisodesBySeason).map(async ([seasonKey, eps]) => {
                const seasonNum = Number(seasonKey) || 1;
                const sMeta = seasonMetaList.find((s) => Number(s.season_number) === seasonNum);
                const episodes: EpisodeItem[] = await Promise.all(
                  (Array.isArray(eps) ? eps : []).map(async (ep, epIdx) => {
                    const epId = String(ep.id || `${id}-${seasonNum}-${epIdx + 1}`);
                    const epNum = Number(ep.episode_num || epIdx + 1);
                    const ext =
                      String(ep.container_extension || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4';
                    const epInfo = (ep.info as Record<string, unknown>) || {};
                    const dur = formatDurationMinutes(epInfo.duration || epInfo.duration_secs);
                    let streamUrl: string | undefined;
                    if (session.serverUrl && session.username && session.password) {
                      const upstream = `${session.serverUrl}/series/${encodeURIComponent(session.username)}/${encodeURIComponent(session.password)}/${encodeURIComponent(epId)}.${ext}`;
                      streamUrl = await createStreamProxyUrl(upstream, env);
                    }
                    return {
                      id: epId,
                      seriesId: id,
                      seasonNumber: seasonNum,
                      episodeNumber: epNum,
                      title: String(ep.title || `Episódio ${epNum}`).trim(),
                      description: String(epInfo.plot || '').trim(),
                      duration: dur.label,
                      durationSeconds: dur.seconds,
                      thumbnail: await createImageProxyUrl(
                        String(epInfo.movie_image || info.cover || ''),
                        env,
                      ),
                      streamUrl,
                      streamFormat: ext === 'm3u8' ? 'hls' : 'mp4',
                    };
                  }),
                );

                episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
                return {
                  seasonNumber: seasonNum,
                  name: String(sMeta?.name || `Temporada ${seasonNum}`),
                  episodes,
                };
              }),
            );
            seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

            const backdropList = Array.isArray(info.backdrop_path) ? info.backdrop_path : [];
            const bannerRaw = backdropList[0]
              ? String(backdropList[0])
              : String(info.cover || '');
            const detail: SeriesDetail = {
              ...baseItem,
              description: String(info.plot || baseItem.description || '').trim(),
              poster:
                (await createImageProxyUrl(String(info.cover || ''), env)) || baseItem.poster,
              banner:
                (await createImageProxyUrl(bannerRaw, env)) ||
                baseItem.banner ||
                baseItem.poster,
              year: extractYear(info.releaseDate) || baseItem.year,
              genres: info.genre
                ? String(info.genre)
                    .split(/[,/|]/)
                    .map((g) => g.trim())
                    .filter(Boolean)
                : baseItem.genres,
              seasons,
            };

            await setCachedJson(detailKey, detail);
            return jsonResponse({item: detail, related});
          } catch {
            // Fall through
          }
        }

        const fallbackDetail: SeriesDetail = {
          ...baseItem,
          seasons: baseItem.streamUrl
            ? [
                {
                  seasonNumber: 1,
                  name: 'Temporada 1',
                  episodes: [
                    {
                      id: `${baseItem.id}-ep1`,
                      seriesId: baseItem.id,
                      seasonNumber: 1,
                      episodeNumber: 1,
                      title: baseItem.title,
                      description: baseItem.description,
                      streamUrl: baseItem.streamUrl,
                      streamFormat: baseItem.streamFormat,
                    },
                  ],
                },
              ]
            : [],
        };
        return jsonResponse({item: fallbackDetail, related});
      }

      return jsonResponse({item: baseItem, related});
    }

    // Global Search
    if (pathname === '/api/iptv/search' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      if (q.length < 2) {
        return jsonResponse({movies: [], series: [], live: [], episodes: []} satisfies GlobalSearchResponse);
      }

      const [moviesRes, seriesRes, liveRes] = await Promise.allSettled([
        loadCatalogForType(session, 'movie', env),
        loadCatalogForType(session, 'series', env),
        loadCatalogForType(session, 'live', env),
      ]);

      const movies =
        moviesRes.status === 'fulfilled'
          ? moviesRes.value.items.filter((i) => i.title.toLowerCase().includes(q)).slice(0, 18)
          : [];
      const series =
        seriesRes.status === 'fulfilled'
          ? seriesRes.value.items.filter((i) => i.title.toLowerCase().includes(q)).slice(0, 18)
          : [];
      const live =
        liveRes.status === 'fulfilled'
          ? liveRes.value.items.filter((i) => i.title.toLowerCase().includes(q)).slice(0, 18)
          : [];

      const episodes: GlobalSearchResponse['episodes'] = [];
      for (const entry of memoryCatalogCache.values()) {
        const candidate = entry.data as Partial<SeriesDetail> | undefined;
        if (candidate && Array.isArray(candidate.seasons) && candidate.title) {
          for (const season of candidate.seasons) {
            for (const ep of season.episodes) {
              if (ep.title.toLowerCase().includes(q)) {
                episodes.push({
                  ...ep,
                  seriesTitle: candidate.title,
                  seriesPoster: candidate.poster || '',
                });
              }
            }
          }
        }
      }

      return jsonResponse({
        movies,
        series,
        live,
        episodes: episodes.slice(0, 18),
      } satisfies GlobalSearchResponse);
    }

    return jsonResponse({error: 'Rota da API não encontrada.'}, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno no servidor IPTV.';
    return jsonResponse({error: message}, 400);
  }
}
