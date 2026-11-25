import type {
  CategoryItem,
  GlobalSearchResponse,
  HomeCatalogResponse,
  MediaItem,
  MediaType,
  PaginatedCatalogResponse,
  SeriesDetail,
} from '../types/catalog';

const HERO_BACKDROP = '/src/assets/images/hero_cinema_backdrop_1795629635479.jpg';
const POSTER_HORIZON = '/src/assets/images/poster_demo_horizon_1795629634359.jpg';
const POSTER_CHRONICLE = '/src/assets/images/poster_demo_chronicle_1795629635376.jpg';
const POSTER_WILDS = '/src/assets/images/poster_demo_wilds_1795629634662.jpg';

export const DEMO_CATEGORIES: {
  movies: CategoryItem[];
  series: CategoryItem[];
  live: CategoryItem[];
} = {
  movies: [
    {id: 'demo-cat-scifi', name: 'Ficção Científica', type: 'movie'},
    {id: 'demo-cat-drama', name: 'Drama & Mistério', type: 'movie'},
    {id: 'demo-cat-doc', name: 'Documentários', type: 'movie'},
  ],
  series: [
    {id: 'demo-cat-s-drama', name: 'Suspense & Investigação', type: 'series'},
    {id: 'demo-cat-s-doc', name: 'Natureza & Ciência', type: 'series'},
  ],
  live: [],
};

export const DEMO_MOVIES: MediaItem[] = [
  {
    id: 'demo-movie-1',
    type: 'movie',
    title: 'Observatório do Atlântico (Demonstração)',
    description:
      'Conteúdo de demonstração para ilustrar a interface do GreenPlay TV. Conecte sua lista IPTV real para carregar filmes e transmissões oficiais do seu provedor.',
    poster: POSTER_CHRONICLE,
    banner: HERO_BACKDROP,
    genres: ['Drama & Mistério', 'Suspense'],
    categoryId: 'demo-cat-drama',
    categoryName: 'Drama & Mistério',
    year: '2025',
    duration: '2h 08m',
    durationSeconds: 7680,
    isDemo: true,
  },
  {
    id: 'demo-movie-2',
    type: 'movie',
    title: 'Horizonte de Obsidiana (Demonstração)',
    description:
      'Item demonstrativo de catálogo cinematográfico sem fonte de vídeo associada. Faça login com suas credenciais IPTV para reproduzir o catálogo real.',
    poster: POSTER_HORIZON,
    banner: HERO_BACKDROP,
    genres: ['Ficção Científica'],
    categoryId: 'demo-cat-scifi',
    categoryName: 'Ficção Científica',
    year: '2024',
    duration: '1h 54m',
    durationSeconds: 6840,
    isDemo: true,
  },
  {
    id: 'demo-movie-3',
    type: 'movie',
    title: 'Florestas de Neblina (Demonstração)',
    description:
      'Exemplo de card documental exibindo metadados estruturados, sinopse e suporte a lista de favoritos sem utilizar links fictícios de vídeo.',
    poster: POSTER_WILDS,
    banner: HERO_BACKDROP,
    genres: ['Documentários'],
    categoryId: 'demo-cat-doc',
    categoryName: 'Documentários',
    year: '2025',
    duration: '1h 36m',
    durationSeconds: 5760,
    isDemo: true,
  },
];

export const DEMO_SERIES: SeriesDetail[] = [
  {
    id: 'demo-series-1',
    type: 'series',
    title: 'Estação Norte (Demonstração)',
    description:
      'Série de demonstração estruturada com temporadas e episódios para validar a navegação do catálogo. Nenhuma mídia real é simulada sem conexão IPTV.',
    poster: POSTER_CHRONICLE,
    banner: HERO_BACKDROP,
    genres: ['Suspense & Investigação'],
    categoryId: 'demo-cat-s-drama',
    categoryName: 'Suspense & Investigação',
    year: '2025',
    isDemo: true,
    seasons: [
      {
        seasonNumber: 1,
        name: 'Temporada 1',
        episodes: [
          {
            id: 'demo-ep-101',
            seriesId: 'demo-series-1',
            seasonNumber: 1,
            episodeNumber: 1,
            title: 'Sinal na Plataforma (Demonstração)',
            description:
              'Episódio demonstrativo da Temporada 1. Conecte uma lista IPTV real para reproduzir episódios.',
            duration: '46 min',
            durationSeconds: 2760,
            thumbnail: HERO_BACKDROP,
            isDemo: true,
          },
          {
            id: 'demo-ep-102',
            seriesId: 'demo-series-1',
            seasonNumber: 1,
            episodeNumber: 2,
            title: 'Turnos da Madrugada (Demonstração)',
            description:
              'Segundo episódio demonstrativo exibindo troca de episódios e histórico de reprodução.',
            duration: '49 min',
            durationSeconds: 2940,
            thumbnail: POSTER_CHRONICLE,
            isDemo: true,
          },
        ],
      },
      {
        seasonNumber: 2,
        name: 'Temporada 2',
        episodes: [
          {
            id: 'demo-ep-201',
            seriesId: 'demo-series-1',
            seasonNumber: 2,
            episodeNumber: 1,
            title: 'Maré Baixa (Demonstração)',
            description: 'Episódio demonstrativo da Temporada 2 para validação do seletor.',
            duration: '52 min',
            durationSeconds: 3120,
            thumbnail: HERO_BACKDROP,
            isDemo: true,
          },
        ],
      },
    ],
  },
  {
    id: 'demo-series-2',
    type: 'series',
    title: 'Biomas Ocultos (Demonstração)',
    description:
      'Série documental demonstrativa organizada em episódios. Conecte seu provedor Xtream Codes ou lista M3U para assistir ao conteúdo real.',
    poster: POSTER_WILDS,
    banner: HERO_BACKDROP,
    genres: ['Natureza & Ciência'],
    categoryId: 'demo-cat-s-doc',
    categoryName: 'Natureza & Ciência',
    year: '2024',
    isDemo: true,
    seasons: [
      {
        seasonNumber: 1,
        name: 'Temporada 1',
        episodes: [
          {
            id: 'demo-ep-301',
            seriesId: 'demo-series-2',
            seasonNumber: 1,
            episodeNumber: 1,
            title: 'Raízes da Costa (Demonstração)',
            description: 'Episódio de exemplo sem link de transmissão fictício.',
            duration: '44 min',
            durationSeconds: 2640,
            thumbnail: POSTER_WILDS,
            isDemo: true,
          },
        ],
      },
    ],
  },
];

export function getDemoHomeCatalog(): HomeCatalogResponse {
  return {
    featured: DEMO_MOVIES[0],
    liveChannels: [],
    popularMovies: DEMO_MOVIES,
    popularSeries: DEMO_SERIES,
    recentlyAdded: [DEMO_MOVIES[0], DEMO_SERIES[0], DEMO_MOVIES[2], DEMO_MOVIES[1]],
    categories: DEMO_CATEGORIES,
  };
}

export function getDemoCatalogPage(params: {
  type: MediaType;
  categoryId?: string;
  q?: string;
  genre?: string;
  year?: string;
  sort?: string;
  page?: number;
  limit?: number;
}): PaginatedCatalogResponse {
  const source: MediaItem[] =
    params.type === 'movie'
      ? DEMO_MOVIES
      : params.type === 'series'
        ? DEMO_SERIES
        : [];
  const categories =
    params.type === 'movie'
      ? DEMO_CATEGORIES.movies
      : params.type === 'series'
        ? DEMO_CATEGORIES.series
        : [];

  const years = [...new Set(source.map((i) => i.year).filter(Boolean) as string[])];
  const genres = [...new Set(source.flatMap((i) => i.genres))];

  let filtered = [...source];
  if (params.categoryId && params.categoryId !== 'all') {
    filtered = filtered.filter((i) => i.categoryId === params.categoryId);
  }
  if (params.genre && params.genre !== 'all') {
    const gLower = params.genre.toLowerCase();
    filtered = filtered.filter((i) => i.genres.some((g) => g.toLowerCase() === gLower));
  }
  if (params.year && params.year !== 'all') {
    filtered = filtered.filter((i) => i.year === params.year);
  }
  if (params.q?.trim()) {
    const qLower = params.q.trim().toLowerCase();
    filtered = filtered.filter(
      (i) =>
        i.title.toLowerCase().includes(qLower) ||
        i.description.toLowerCase().includes(qLower),
    );
  }
  if (params.sort === 'title_asc') {
    filtered.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  } else if (params.sort === 'title_desc') {
    filtered.sort((a, b) => b.title.localeCompare(a.title, 'pt-BR'));
  } else if (params.sort === 'year_desc') {
    filtered.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
  }

  return {
    items: filtered,
    total: filtered.length,
    page: 1,
    totalPages: 1,
    categories,
    years,
    genres,
  };
}

export function getDemoItemDetail(
  type: MediaType,
  id: string,
): {item: MediaItem | SeriesDetail; related: MediaItem[]} | null {
  if (type === 'movie') {
    const item = DEMO_MOVIES.find((m) => m.id === id);
    if (!item) return null;
    return {item, related: DEMO_MOVIES.filter((m) => m.id !== id)};
  }
  if (type === 'series') {
    const item = DEMO_SERIES.find((s) => s.id === id);
    if (!item) return null;
    return {item, related: DEMO_SERIES.filter((s) => s.id !== id)};
  }
  return null;
}

export function searchDemoCatalog(query: string): GlobalSearchResponse {
  const q = query.trim().toLowerCase();
  if (q.length < 2) {
    return {movies: [], series: [], live: [], episodes: []};
  }
  const movies = DEMO_MOVIES.filter((m) => m.title.toLowerCase().includes(q));
  const series = DEMO_SERIES.filter((s) => s.title.toLowerCase().includes(q));
  const episodes: GlobalSearchResponse['episodes'] = [];
  for (const s of DEMO_SERIES) {
    for (const season of s.seasons) {
      for (const ep of season.episodes) {
        if (ep.title.toLowerCase().includes(q)) {
          episodes.push({
            ...ep,
            seriesTitle: s.title,
            seriesPoster: s.poster,
          });
        }
      }
    }
  }
  return {movies, series, live: [], episodes};
}
