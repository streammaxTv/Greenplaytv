import type {
  AuthSessionInfo,
  CategoryItem,
  GlobalSearchResponse,
  HomeCatalogResponse,
  MediaItem,
  MediaType,
  PaginatedCatalogResponse,
  SeriesDetail,
} from '../types/catalog';

// Session token is held strictly in JS memory (never localStorage or sessionStorage)
let inMemoryBearerToken: string | null = null;

export function setAuthToken(token: string | null) {
  inMemoryBearerToken = token;
}

export function hasAuthToken(): boolean {
  return Boolean(inMemoryBearerToken);
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (inMemoryBearerToken) {
    headers.set('Authorization', `Bearer ${inMemoryBearerToken}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...init,
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as T & {error?: string};
  if (!res.ok) {
    throw new Error(data?.error || `Erro na requisição (${res.status}).`);
  }
  return data;
}

export async function loginXtream(params: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<{token: string; session: AuthSessionInfo}> {
  const result = await apiFetch<{token: string; session: AuthSessionInfo}>('/api/auth/xtream', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  setAuthToken(result.token);
  return result;
}

export async function loginM3U(params: {
  m3uUrl: string;
}): Promise<{token: string; session: AuthSessionInfo}> {
  const result = await apiFetch<{token: string; session: AuthSessionInfo}>('/api/auth/m3u', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  setAuthToken(result.token);
  return result;
}

export async function logoutIptv(): Promise<void> {
  try {
    if (inMemoryBearerToken) {
      await apiFetch('/api/auth/logout', {method: 'POST'});
    }
  } finally {
    setAuthToken(null);
  }
}

export async function fetchHomeCatalog(): Promise<HomeCatalogResponse> {
  return apiFetch<HomeCatalogResponse>('/api/iptv/home');
}

export async function fetchCatalogPage(params: {
  type: MediaType;
  categoryId?: string;
  q?: string;
  genre?: string;
  year?: string;
  sort?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedCatalogResponse> {
  const search = new URLSearchParams();
  search.set('type', params.type);
  if (params.categoryId) search.set('categoryId', params.categoryId);
  if (params.q) search.set('q', params.q);
  if (params.genre) search.set('genre', params.genre);
  if (params.year) search.set('year', params.year);
  if (params.sort) search.set('sort', params.sort);
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  return apiFetch<PaginatedCatalogResponse>(`/api/iptv/catalog?${search.toString()}`);
}

export async function fetchItemDetail(
  type: MediaType,
  id: string,
): Promise<{item: MediaItem | SeriesDetail; related: MediaItem[]}> {
  return apiFetch<{item: MediaItem | SeriesDetail; related: MediaItem[]}>(
    `/api/iptv/item/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
  );
}

export async function searchGlobalCatalog(q: string): Promise<GlobalSearchResponse> {
  return apiFetch<GlobalSearchResponse>(`/api/iptv/search?q=${encodeURIComponent(q)}`);
}

export async function fetchOwnerLivePlaylist(): Promise<{
  configured: boolean;
  categories: CategoryItem[];
  channels: MediaItem[];
  error?: string;
}> {
  return apiFetch('/api/iptv/owner-live');
}
