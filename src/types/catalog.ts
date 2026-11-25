export type MediaType = 'movie' | 'series' | 'live';

export interface CategoryItem {
  id: string;
  name: string;
  type: MediaType;
}

export interface MediaItem {
  id: string;
  type: MediaType;
  title: string;
  description: string;
  poster: string;
  banner: string;
  genres: string[];
  categoryId: string;
  categoryName?: string;
  year?: string;
  duration?: string;
  durationSeconds?: number;
  rating?: string;
  streamUrl?: string;
  streamFormat?: 'hls' | 'mp4' | 'ts';
  channelNumber?: number;
  isDemo?: boolean;
}

export interface EpisodeItem {
  id: string;
  seriesId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  description: string;
  duration?: string;
  durationSeconds?: number;
  thumbnail?: string;
  streamUrl?: string;
  streamFormat?: 'hls' | 'mp4' | 'ts';
  isDemo?: boolean;
}

export interface SeasonGroup {
  seasonNumber: number;
  name: string;
  episodes: EpisodeItem[];
}

export interface SeriesDetail extends MediaItem {
  seasons: SeasonGroup[];
}

export interface ContinueWatchingEntry {
  key: string;
  mediaType: MediaType;
  mediaId: string;
  seriesId?: string;
  episodeId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  title: string;
  poster: string;
  banner: string;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: number;
  isDemo?: boolean;
}

export interface AuthSessionInfo {
  authenticated: boolean;
  mode: 'xtream' | 'm3u' | 'demo';
  accountLabel: string;
  serverHost?: string;
  status?: string;
  expiresAt?: string;
  maxConnections?: string;
  activeConnections?: string;
  capabilities: {
    live: boolean;
    movies: boolean;
    series: boolean;
  };
}

export interface HomeCatalogResponse {
  featured: MediaItem | null;
  liveChannels: MediaItem[];
  popularMovies: MediaItem[];
  popularSeries: MediaItem[];
  recentlyAdded: MediaItem[];
  categories: {
    movies: CategoryItem[];
    series: CategoryItem[];
    live: CategoryItem[];
  };
}

export interface PaginatedCatalogResponse {
  items: MediaItem[];
  total: number;
  page: number;
  totalPages: number;
  categories: CategoryItem[];
  years: string[];
  genres: string[];
}

export interface GlobalSearchResponse {
  movies: MediaItem[];
  series: MediaItem[];
  live: MediaItem[];
  episodes: (EpisodeItem & { seriesTitle: string; seriesPoster: string })[];
}

export interface PlayerTarget {
  mediaType: MediaType;
  id: string;
  title: string;
  subtitle?: string;
  poster: string;
  banner: string;
  streamUrl?: string;
  streamFormat?: 'hls' | 'mp4' | 'ts';
  isDemo?: boolean;
  seriesId?: string;
  episodeId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodesQueue?: EpisodeItem[];
  channelsQueue?: MediaItem[];
  resumeAtSeconds?: number;
}
