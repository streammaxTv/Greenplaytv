import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import express, {type NextFunction, type Request, type Response} from 'express';
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
} from './src/types/catalog.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STREAM_TOKEN_TTL_SEC = 4 * 60 * 60; // 4 hours
const MAX_M3U_BYTES = 25 * 1024 * 1024; // 25MB cap

interface CachedTypeCatalog {
  categories: CategoryItem[];
  items: MediaItem[];
  fetchedAt: number;
}

interface ServerSession {
  id: string;
  mode: 'xtream' | 'm3u';
  serverUrl?: string;
  username?: string;
  password?: string;
  m3uUrl?: string;
  info: AuthSessionInfo;
  createdAt: number;
  lastAccessAt: number;
  cache: {
    live?: CachedTypeCatalog;
    movie?: CachedTypeCatalog;
    series?: CachedTypeCatalog;
    seriesDetails: Map<string, {detail: SeriesDetail; fetchedAt: number}>;
    movieInfo: Map<string, {item: MediaItem; fetchedAt: number}>;
  };
}

const sessions = new Map<string, ServerSession>();

// Periodic cleanup of expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastAccessAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 15 * 60 * 1000).unref();

// --- Security & SSRF Helpers ---

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const norm = ip.toLowerCase();
    if (norm === '::1' || norm === '::') return true;
    if (norm.startsWith('fc') || norm.startsWith('fd')) return true; // Unique local
    if (norm.startsWith('fe80')) return true; // Link-local
    if (norm.startsWith('::ffff:')) {
      const mapped = norm.slice(7);
      return isPrivateOrReservedIp(mapped);
    }
    return false;
  }
  return true;
}

async function validateExternalUrl(rawUrl: string): Promise<URL> {
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

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('Endereço de servidor não permitido.');
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error('Endereços de rede privada ou local não são permitidos.');
    }
  } else {
    try {
      const records = await dns.lookup(host, {all: true});
      if (!records.length || records.some((r) => isPrivateOrReservedIp(r.address))) {
        throw new Error('O servidor informado resolve para um endereço de rede restrito.');
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('restrito')) {
        throw err;
      }
      throw new Error('Não foi possível localizar o servidor IPTV informado.');
    }
  }

  return parsed;
}

async function safeFetch(
  targetUrl: string,
  options: {timeoutMs?: number; headers?: Record<string, string>; maxRedirects?: number} = {},
): Promise<globalThis.Response> {
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

// --- Session & Stream Token Signing ---

function signValue(payload: string): string {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySignedValue(token: string): string | null {
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  return payload;
}

function createSessionToken(sessionId: string): string {
  return signValue(sessionId);
}

function resolveSessionFromHeader(req: Request): ServerSession | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const rawToken = authHeader.slice(7).trim();
  const sessionId = verifySignedValue(rawToken);
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.lastAccessAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  session.lastAccessAt = Date.now();
  return session;
}

interface StreamTokenPayload {
  sid: string;
  url: string;
  exp: number;
}

function createStreamProxyUrl(sessionId: string, upstreamUrl: string): string {
  const payloadObj: StreamTokenPayload = {
    sid: sessionId,
    url: upstreamUrl,
    exp: Math.floor(Date.now() / 1000) + STREAM_TOKEN_TTL_SEC,
  };
  const encoded = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const signed = signValue(encoded);
  return `/api/iptv/stream?st=${encodeURIComponent(signed)}`;
}

function createImageProxyUrl(sessionId: string, imageUrl: string): string {
  if (!imageUrl || !imageUrl.trim()) return '';
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (!trimmed.startsWith('http://')) {
    return '';
  }
  const payloadObj: StreamTokenPayload = {
    sid: sessionId,
    url: trimmed,
    exp: Math.floor(Date.now() / 1000) + STREAM_TOKEN_TTL_SEC,
  };
  const encoded = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const signed = signValue(encoded);
  return `/api/iptv/image?st=${encodeURIComponent(signed)}`;
}

function verifyStreamToken(token: string): StreamTokenPayload | null {
  const encoded = verifySignedValue(token);
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as StreamTokenPayload;
    if (!parsed.sid || !parsed.url || !parsed.exp) return null;
    if (Math.floor(Date.now() / 1000) > parsed.exp) return null;
    if (parsed.sid !== 'owner-live' && !sessions.has(parsed.sid)) return null;
    return parsed;
  } catch {
    return null;
  }
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

function parseM3UPlaylist(content: string, sessionId: string) {
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
    tvgId: string;
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
      const tvgId = extractAttr(line, 'tvg-id');
      currentMeta = {
        name: displayName || tvgName || `Canal ${index + 1}`,
        logo,
        group,
        tvgId,
      };
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    if (currentMeta && (line.startsWith('http://') || line.startsWith('https://'))) {
      index += 1;
      const type = inferM3UType(currentMeta.group, line, currentMeta.name);
      const catId = `m3u-${type}-${Buffer.from(currentMeta.group).toString('base64url').slice(0, 24)}`;
      const itemId = `m3u-${index}`;
      const poster = createImageProxyUrl(sessionId, currentMeta.logo);
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
        streamUrl: createStreamProxyUrl(sessionId, line),
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
    live: {categories: [...liveCategoriesMap.values()], items: liveItems},
    movie: {categories: [...movieCategoriesMap.values()], items: movieItems},
    series: {categories: [...seriesCategoriesMap.values()], items: seriesItems},
  };
}

// --- Xtream Codes Fetchers ---

function formatDurationMinutes(value: unknown): {label?: string; seconds?: number} {
  if (!value) return {};
  const str = String(value).trim();
  if (!str) return {};

  // HH:MM:SS format
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
    // Assume minutes if <= 600, else seconds
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
  session: ServerSession,
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

async function loadXtreamCatalogForType(
  session: ServerSession,
  type: MediaType,
): Promise<CachedTypeCatalog> {
  const existing = session.cache[type];
  if (session.mode === 'm3u') {
    return existing || {categories: [], items: [], fetchedAt: Date.now()};
  }
  if (existing && Date.now() - existing.fetchedAt < CACHE_TTL_MS) {
    return existing;
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

  const items: MediaItem[] = Array.isArray(rawItems)
    ? rawItems.map((raw, idx) => {
        const id = String(
          type === 'series' ? (raw.series_id ?? raw.id ?? idx) : (raw.stream_id ?? raw.id ?? idx),
        );
        const categoryId = String(raw.category_id ?? '');
        const categoryName = catNameById.get(categoryId) || 'Catálogo';
        const title = String(raw.name || raw.title || `Item ${idx + 1}`).trim();
        const rawCover = String(raw.stream_icon || raw.cover || '');
        const poster = createImageProxyUrl(session.id, rawCover);
        const backdropList = Array.isArray(raw.backdrop_path) ? raw.backdrop_path : [];
        const rawBanner = backdropList[0] ? String(backdropList[0]) : rawCover;
        const banner = createImageProxyUrl(session.id, rawBanner) || poster;
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
          streamUrl = createStreamProxyUrl(session.id, upstream);
          streamFormat = 'hls';
        } else if (type === 'movie' && session.serverUrl && session.username && session.password) {
          const ext = String(raw.container_extension || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4';
          const upstream = `${session.serverUrl}/movie/${encodeURIComponent(session.username)}/${encodeURIComponent(session.password)}/${encodeURIComponent(id)}.${ext}`;
          streamUrl = createStreamProxyUrl(session.id, upstream);
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
      })
    : [];

  const cached: CachedTypeCatalog = {
    categories,
    items,
    fetchedAt: Date.now(),
  };
  session.cache[type] = cached;
  return cached;
}

// --- Express App Setup ---

const app = express();
app.set('trust proxy', 1);
app.use(express.json({limit: '1mb'}));

function requireSession(req: Request, res: Response, next: NextFunction) {
  const session = resolveSessionFromHeader(req);
  if (!session) {
    res.status(401).json({error: 'Sessão não autenticada ou expirada. Conecte sua lista IPTV.'});
    return;
  }
  (req as Request & {iptvSession: ServerSession}).iptvSession = session;
  next();
}

// Health check for Cloud Run
app.get('/api/health', (_req, res) => {
  res.json({status: 'ok'});
});

// Authenticate via Xtream Codes
app.post('/api/auth/xtream', async (req, res) => {
  try {
    const {serverUrl, username, password} = req.body as {
      serverUrl?: string;
      username?: string;
      password?: string;
    };

    if (!serverUrl || !username || !password) {
      res.status(400).json({error: 'Informe a URL do servidor, usuário e senha.'});
      return;
    }

    const normalizedBase = serverUrl.trim().replace(/\/+$/, '');
    const parsedUrl = await validateExternalUrl(normalizedBase);
    const baseOrigin = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname === '/' ? '' : parsedUrl.pathname}`;

    const authUrl = new URL(`${baseOrigin}/player_api.php`);
    authUrl.searchParams.set('username', username.trim());
    authUrl.searchParams.set('password', password);

    const upstreamRes = await safeFetch(authUrl.toString(), {timeoutMs: 12000});
    if (!upstreamRes.ok) {
      res
        .status(401)
        .json({error: `O provedor IPTV recusou a conexão (HTTP ${upstreamRes.status}).`});
      return;
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
      res.status(400).json({
        error: 'O endereço informado não retornou uma API Xtream Codes válida.',
      });
      return;
    }

    const userInfo = data?.user_info;
    if (!userInfo || String(userInfo.auth) !== '1') {
      res.status(401).json({error: 'Usuário ou senha IPTV inválidos.'});
      return;
    }

    const status = String(userInfo.status || 'Active');
    if (status.toLowerCase() !== 'active') {
      res.status(403).json({
        error: `Conta IPTV com status "${status}". Verifique a validade com seu provedor.`,
      });
      return;
    }

    let expiresAt: string | undefined;
    if (userInfo.exp_date && /^\d+$/.test(String(userInfo.exp_date))) {
      const ts = Number(userInfo.exp_date) * 1000;
      if (ts > 0) {
        expiresAt = new Date(ts).toLocaleDateString('pt-BR');
      }
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    const info: AuthSessionInfo = {
      authenticated: true,
      mode: 'xtream',
      accountLabel: String(userInfo.username || username.trim()),
      serverHost: parsedUrl.host,
      status: 'Ativa',
      expiresAt,
      maxConnections: userInfo.max_connections ? String(userInfo.max_connections) : undefined,
      activeConnections: userInfo.active_cons ? String(userInfo.active_cons) : undefined,
      capabilities: {live: true, movies: true, series: true},
    };

    const session: ServerSession = {
      id: sessionId,
      mode: 'xtream',
      serverUrl: baseOrigin,
      username: username.trim(),
      password,
      info,
      createdAt: Date.now(),
      lastAccessAt: Date.now(),
      cache: {
        seriesDetails: new Map(),
        movieInfo: new Map(),
      },
    };
    sessions.set(sessionId, session);

    res.json({
      token: createSessionToken(sessionId),
      session: info,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Falha ao conectar ao servidor IPTV.';
    res.status(400).json({error: message});
  }
});

// Authenticate via complete M3U URL
app.post('/api/auth/m3u', async (req, res) => {
  try {
    const {m3uUrl} = req.body as {m3uUrl?: string};
    if (!m3uUrl || !m3uUrl.trim()) {
      res.status(400).json({error: 'Informe a URL completa da lista M3U.'});
      return;
    }

    const parsed = await validateExternalUrl(m3uUrl);
    const upstreamRes = await safeFetch(parsed.toString(), {timeoutMs: 20000});
    if (!upstreamRes.ok) {
      res.status(401).json({
        error: `Não foi possível acessar a lista M3U (HTTP ${upstreamRes.status}).`,
      });
      return;
    }

    const contentLength = Number(upstreamRes.headers.get('content-length') || 0);
    if (contentLength > MAX_M3U_BYTES) {
      res.status(413).json({error: 'A lista M3U excede o limite de tamanho suportado.'});
      return;
    }

    const text = await upstreamRes.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_M3U_BYTES) {
      res.status(413).json({error: 'A lista M3U excede o limite de tamanho suportado.'});
      return;
    }
    if (!text.includes('#EXTM3U') && !text.includes('#EXTINF')) {
      res.status(400).json({
        error: 'O link informado não contém uma playlist M3U válida.',
      });
      return;
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    const parsedCatalog = parseM3UPlaylist(text, sessionId);
    const totalCount =
      parsedCatalog.live.items.length +
      parsedCatalog.movie.items.length +
      parsedCatalog.series.items.length;

    if (totalCount === 0) {
      res.status(400).json({error: 'Nenhum canal ou conteúdo válido encontrado na lista M3U.'});
      return;
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

    const now = Date.now();
    const session: ServerSession = {
      id: sessionId,
      mode: 'm3u',
      m3uUrl: parsed.toString(),
      info,
      createdAt: now,
      lastAccessAt: now,
      cache: {
        live: {...parsedCatalog.live, fetchedAt: now},
        movie: {...parsedCatalog.movie, fetchedAt: now},
        series: {...parsedCatalog.series, fetchedAt: now},
        seriesDetails: new Map(),
        movieInfo: new Map(),
      },
    };
    sessions.set(sessionId, session);

    res.json({
      token: createSessionToken(sessionId),
      session: info,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar playlist M3U.';
    res.status(400).json({error: message});
  }
});

app.get('/api/auth/session', (req, res) => {
  const session = resolveSessionFromHeader(req);
  if (!session) {
    res.json({authenticated: false});
    return;
  }
  res.json(session.info);
});

app.post('/api/auth/logout', (req, res) => {
  const session = resolveSessionFromHeader(req);
  if (session) {
    sessions.delete(session.id);
  }
  res.json({ok: true});
});

// Owner-configured optional Live TV M3U playlist (when no personal IPTV session is active)
app.get('/api/iptv/owner-live', async (_req, res) => {
  const ownerUrl = process.env.DEFAULT_LIVE_PLAYLIST_URL?.trim();
  if (!ownerUrl) {
    res.json({configured: false, categories: [], channels: []});
    return;
  }

  try {
    const validated = await validateExternalUrl(ownerUrl);
    const upstreamRes = await safeFetch(validated.toString(), {timeoutMs: 15000});
    if (!upstreamRes.ok) {
      res.status(502).json({configured: true, error: 'Falha ao carregar playlist configurada.'});
      return;
    }
    const text = await upstreamRes.text();
    const parsed = parseM3UPlaylist(text, 'owner-live');
    res.json({
      configured: true,
      categories: parsed.live.categories,
      channels: parsed.live.items,
    });
  } catch {
    res.status(502).json({configured: true, error: 'Erro ao conectar à playlist ao vivo.'});
  }
});

// Home feed (lightweight slices, independent category resilience)
app.get('/api/iptv/home', requireSession, async (req, res) => {
  const session = (req as Request & {iptvSession: ServerSession}).iptvSession;

  const [moviesRes, seriesRes, liveRes] = await Promise.allSettled([
    loadXtreamCatalogForType(session, 'movie'),
    loadXtreamCatalogForType(session, 'series'),
    loadXtreamCatalogForType(session, 'live'),
  ]);

  const moviesCat = moviesRes.status === 'fulfilled' ? moviesRes.value : {categories: [], items: []};
  const seriesCat = seriesRes.status === 'fulfilled' ? seriesRes.value : {categories: [], items: []};
  const liveCat = liveRes.status === 'fulfilled' ? liveRes.value : {categories: [], items: []};

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
  res.json(response);
});

// Paginated & filtered catalog
app.get('/api/iptv/catalog', requireSession, async (req, res) => {
  try {
    const session = (req as Request & {iptvSession: ServerSession}).iptvSession;
    const rawType = String(req.query.type || 'movie');
    if (rawType !== 'movie' && rawType !== 'series' && rawType !== 'live') {
      res.status(400).json({error: 'Tipo de catálogo inválido.'});
      return;
    }

    const catalog =
      session.mode === 'm3u'
        ? session.cache[rawType] || {categories: [], items: [], fetchedAt: Date.now()}
        : await loadXtreamCatalogForType(session, rawType);

    const categoryId = String(req.query.categoryId || 'all');
    const q = String(req.query.q || '').trim().toLowerCase();
    const genre = String(req.query.genre || 'all').trim().toLowerCase();
    const year = String(req.query.year || 'all').trim();
    const sort = String(req.query.sort || 'default');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(80, Math.max(12, Number(req.query.limit) || 36));

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
    res.json(response);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Erro ao carregar catálogo.',
    });
  }
});

// Item details (Movie, Series + Seasons/Episodes, or Live Channel) + Related items
app.get('/api/iptv/item/:type/:id', requireSession, async (req, res) => {
  try {
    const session = (req as Request & {iptvSession: ServerSession}).iptvSession;
    const type = String(req.params.type);
    const id = String(req.params.id);

    if (type !== 'movie' && type !== 'series' && type !== 'live') {
      res.status(400).json({error: 'Tipo inválido.'});
      return;
    }

    const catalog =
      session.mode === 'm3u'
        ? session.cache[type] || {categories: [], items: [], fetchedAt: Date.now()}
        : await loadXtreamCatalogForType(session, type);

    const baseItem = catalog.items.find((i) => i.id === id);
    if (!baseItem) {
      res.status(404).json({error: 'Conteúdo não encontrado na sua lista.'});
      return;
    }

    const related = catalog.items
      .filter((i) => i.id !== id && i.categoryId === baseItem.categoryId)
      .slice(0, 12);

    if (type === 'movie') {
      if (session.mode === 'xtream') {
        const cachedMovie = session.cache.movieInfo.get(id);
        if (cachedMovie && Date.now() - cachedMovie.fetchedAt < CACHE_TTL_MS) {
          res.json({item: cachedMovie.item, related});
          return;
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
          const bannerRaw = backdropList[0] ? String(backdropList[0]) : String(info.movie_image || '');
          const enriched: MediaItem = {
            ...baseItem,
            description: String(info.plot || info.description || baseItem.description || '').trim(),
            banner: createImageProxyUrl(session.id, bannerRaw) || baseItem.banner || baseItem.poster,
            poster: createImageProxyUrl(session.id, String(info.movie_image || '')) || baseItem.poster,
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
          if (movieData.container_extension && session.serverUrl && session.username && session.password) {
            const ext = String(movieData.container_extension).replace(/[^a-z0-9]/gi, '') || 'mp4';
            const upstream = `${session.serverUrl}/movie/${encodeURIComponent(session.username)}/${encodeURIComponent(session.password)}/${encodeURIComponent(id)}.${ext}`;
            enriched.streamUrl = createStreamProxyUrl(session.id, upstream);
            enriched.streamFormat = ext === 'm3u8' ? 'hls' : 'mp4';
          }
          session.cache.movieInfo.set(id, {item: enriched, fetchedAt: Date.now()});
          res.json({item: enriched, related});
          return;
        } catch {
          // Fall back gracefully to base item
        }
      }
      res.json({item: baseItem, related});
      return;
    }

    if (type === 'series') {
      if (session.mode === 'xtream') {
        const cachedSeries = session.cache.seriesDetails.get(id);
        if (cachedSeries && Date.now() - cachedSeries.fetchedAt < CACHE_TTL_MS) {
          res.json({item: cachedSeries.detail, related});
          return;
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

          const seasons: SeasonGroup[] = Object.entries(rawEpisodesBySeason)
            .map(([seasonKey, eps]) => {
              const seasonNum = Number(seasonKey) || 1;
              const sMeta = seasonMetaList.find((s) => Number(s.season_number) === seasonNum);
              const episodes: EpisodeItem[] = (Array.isArray(eps) ? eps : []).map((ep, epIdx) => {
                const epId = String(ep.id || `${id}-${seasonNum}-${epIdx + 1}`);
                const epNum = Number(ep.episode_num || epIdx + 1);
                const ext = String(ep.container_extension || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4';
                const epInfo = (ep.info as Record<string, unknown>) || {};
                const dur = formatDurationMinutes(epInfo.duration || epInfo.duration_secs);
                let streamUrl: string | undefined;
                if (session.serverUrl && session.username && session.password) {
                  const upstream = `${session.serverUrl}/series/${encodeURIComponent(session.username)}/${encodeURIComponent(session.password)}/${encodeURIComponent(epId)}.${ext}`;
                  streamUrl = createStreamProxyUrl(session.id, upstream);
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
                  thumbnail: createImageProxyUrl(
                    session.id,
                    String(epInfo.movie_image || info.cover || ''),
                  ),
                  streamUrl,
                  streamFormat: ext === 'm3u8' ? 'hls' : 'mp4',
                };
              });

              episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
              return {
                seasonNumber: seasonNum,
                name: String(sMeta?.name || `Temporada ${seasonNum}`),
                episodes,
              };
            })
            .sort((a, b) => a.seasonNumber - b.seasonNumber);

          const backdropList = Array.isArray(info.backdrop_path) ? info.backdrop_path : [];
          const bannerRaw = backdropList[0] ? String(backdropList[0]) : String(info.cover || '');
          const detail: SeriesDetail = {
            ...baseItem,
            description: String(info.plot || baseItem.description || '').trim(),
            poster: createImageProxyUrl(session.id, String(info.cover || '')) || baseItem.poster,
            banner: createImageProxyUrl(session.id, bannerRaw) || baseItem.banner || baseItem.poster,
            year: extractYear(info.releaseDate) || baseItem.year,
            genres: info.genre
              ? String(info.genre)
                  .split(/[,/|]/)
                  .map((g) => g.trim())
                  .filter(Boolean)
              : baseItem.genres,
            seasons,
          };

          session.cache.seriesDetails.set(id, {detail, fetchedAt: Date.now()});
          res.json({item: detail, related});
          return;
        } catch {
          // Fall through with empty seasons
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
      res.json({item: fallbackDetail, related});
      return;
    }

    // Live channel
    res.json({item: baseItem, related});
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Erro ao carregar detalhes.',
    });
  }
});

// Global search across Movies, Series, Live Channels, and cached Episodes
app.get('/api/iptv/search', requireSession, async (req, res) => {
  const session = (req as Request & {iptvSession: ServerSession}).iptvSession;
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) {
    res.json({movies: [], series: [], live: [], episodes: []} satisfies GlobalSearchResponse);
    return;
  }

  const [moviesRes, seriesRes, liveRes] = await Promise.allSettled([
    loadXtreamCatalogForType(session, 'movie'),
    loadXtreamCatalogForType(session, 'series'),
    loadXtreamCatalogForType(session, 'live'),
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
  for (const cached of session.cache.seriesDetails.values()) {
    for (const season of cached.detail.seasons) {
      for (const ep of season.episodes) {
        if (ep.title.toLowerCase().includes(q)) {
          episodes.push({
            ...ep,
            seriesTitle: cached.detail.title,
            seriesPoster: cached.detail.poster,
          });
        }
      }
    }
  }

  res.json({movies, series, live, episodes: episodes.slice(0, 18)});
});

// Secure Stream Proxy (prevents exposing IPTV credentials and resolves CORS / mixed-content)
app.get('/api/iptv/stream', async (req, res) => {
  const st = String(req.query.st || '');
  const payload = verifyStreamToken(st);
  if (!payload) {
    res.status(401).json({error: 'Token de reprodução inválido ou expirado.'});
    return;
  }

  try {
    const headers: Record<string, string> = {};
    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    const upstreamRes = await safeFetch(payload.url, {
      timeoutMs: 20000,
      headers,
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      res.status(upstreamRes.status).json({error: 'Fonte de vídeo indisponível no provedor.'});
      return;
    }

    const contentType = upstreamRes.headers.get('content-type') || '';
    const isHlsManifest =
      contentType.includes('mpegurl') ||
      payload.url.toLowerCase().includes('.m3u8');

    if (isHlsManifest) {
      const manifestText = await upstreamRes.text();
      const baseUrl = upstreamRes.url || payload.url;
      const rewritten = manifestText
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (trimmed.startsWith('#')) {
            // Rewrite URI="..." attributes inside tags like #EXT-X-KEY or #EXT-X-MAP
            return line.replace(/URI="([^"]+)"/g, (_match, uriValue: string) => {
              try {
                const abs = new URL(uriValue, baseUrl).toString();
                return `URI="${createStreamProxyUrl(payload.sid, abs)}"`;
              } catch {
                return `URI="${uriValue}"`;
              }
            });
          }
          try {
            const abs = new URL(trimmed, baseUrl).toString();
            return createStreamProxyUrl(payload.sid, abs);
          } catch {
            return line;
          }
        })
        .join('\n');

      res.status(200);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(rewritten);
      return;
    }

    res.status(upstreamRes.status);
    if (contentType) res.setHeader('Content-Type', contentType);
    const contentLength = upstreamRes.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const contentRange = upstreamRes.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    const acceptRanges = upstreamRes.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    res.setHeader('Cache-Control', 'no-store');

    if (!upstreamRes.body) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(upstreamRes.body as unknown as import('node:stream/web').ReadableStream);
    req.on('close', () => {
      nodeStream.destroy();
    });
    nodeStream.on('error', () => {
      if (!res.headersSent) res.status(502).end();
      else res.end();
    });
    nodeStream.pipe(res);
  } catch {
    if (!res.headersSent) {
      res.status(502).json({error: 'Erro ao transmitir fluxo de vídeo.'});
    }
  }
});

// Secure Image Proxy for HTTP provider posters (prevents mixed-content errors on HTTPS)
app.get('/api/iptv/image', async (req, res) => {
  const st = String(req.query.st || '');
  const payload = verifyStreamToken(st);
  if (!payload) {
    res.status(404).end();
    return;
  }

  try {
    const upstreamRes = await safeFetch(payload.url, {timeoutMs: 8000});
    if (!upstreamRes.ok || !upstreamRes.body) {
      res.status(404).end();
      return;
    }
    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      res.status(400).end();
      return;
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const nodeStream = Readable.fromWeb(upstreamRes.body as unknown as import('node:stream/web').ReadableStream);
    nodeStream.pipe(res);
  } catch {
    res.status(404).end();
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GreenPlay TV server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
