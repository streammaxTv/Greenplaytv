import React from 'react';
import {AlertCircle, RotateCcw} from 'lucide-react';
import {HeroBanner} from '../components/HeroBanner';
import {HorizontalCarousel} from '../components/HorizontalCarousel';
import {MediaCard} from '../components/MediaCard';
import {HeroSkeleton, RowSkeleton} from '../components/Skeletons';
import type {
  CategoryItem,
  ContinueWatchingEntry,
  HomeCatalogResponse,
  MediaItem,
  MediaType,
} from '../types/catalog';

interface HomePageProps {
  catalog: HomeCatalogResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  favorites: MediaItem[];
  history: ContinueWatchingEntry[];
  onPlayItem: (item: MediaItem) => void;
  onResumeHistory: (entry: ContinueWatchingEntry) => void;
  onOpenDetail: (item: MediaItem) => void;
  onNavigateCatalog: (type: MediaType, categoryId?: string) => void;
  onNavigateMyList: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  catalog,
  loading,
  error,
  onRetry,
  favorites,
  history,
  onPlayItem,
  onResumeHistory,
  onOpenDetail,
  onNavigateCatalog,
  onNavigateMyList,
}) => {
  if (loading && !catalog) {
    return (
      <div>
        <HeroSkeleton />
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 py-10 space-y-10">
          <RowSkeleton />
          <RowSkeleton />
        </div>
      </div>
    );
  }

  if (error && !catalog) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <h2 className="font-display text-xl font-semibold text-white">
          Não foi possível carregar o catálogo inicial
        </h2>
        <p className="mt-2 text-sm text-[#9CA8A2]">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#04120B] font-semibold text-sm cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Tentar novamente</span>
        </button>
      </div>
    );
  }

  if (!catalog) return null;

  const allCategories: CategoryItem[] = [
    ...catalog.categories.movies.slice(0, 6),
    ...catalog.categories.series.slice(0, 6),
    ...catalog.categories.live.slice(0, 4),
  ];

  const featuredList = [
    ...catalog.popularMovies.slice(1, 5),
    ...catalog.popularSeries.slice(0, 4),
  ];

  return (
    <div className="pb-16">
      {catalog.featured && (
        <HeroBanner
          item={catalog.featured}
          onPlay={onPlayItem}
          onMoreInfo={onOpenDetail}
        />
      )}

      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 pt-8 sm:pt-10 space-y-10 sm:space-y-12">
        {/* Continue Watching */}
        {history.length > 0 && (
          <HorizontalCarousel title="Continue assistindo">
            {history.map((entry) => {
              const pct =
                entry.durationSeconds > 0
                  ? Math.round((entry.positionSeconds / entry.durationSeconds) * 100)
                  : 15;
              const subtitle = entry.episodeTitle
                ? `T${entry.seasonNumber || 1} · E${entry.episodeNumber || 1} · ${entry.episodeTitle}`
                : 'Continuar reprodução';
              return (
                <div
                  key={entry.key}
                  className="w-[210px] sm:w-[250px] shrink-0 snap-start"
                >
                  <MediaCard
                    aspect="landscape"
                    item={{
                      id: entry.mediaId,
                      type: entry.mediaType,
                      title: entry.title,
                      description: '',
                      poster: entry.poster,
                      banner: entry.banner,
                      genres: [],
                      categoryId: '',
                      isDemo: entry.isDemo,
                    }}
                    progressPercent={pct}
                    subtitleOverride={subtitle}
                    onSelect={() => onResumeHistory(entry)}
                  />
                </div>
              );
            })}
          </HorizontalCarousel>
        )}

        {/* Em destaque */}
        {featuredList.length > 0 && (
          <HorizontalCarousel title="Em destaque">
            {featuredList.map((item) => (
              <div
                key={`feat-${item.type}-${item.id}`}
                className="w-[146px] sm:w-[172px] md:w-[190px] shrink-0 snap-start"
              >
                <MediaCard item={item} onSelect={onOpenDetail} />
              </div>
            ))}
          </HorizontalCarousel>
        )}

        {/* Filmes populares */}
        {catalog.popularMovies.length > 0 && (
          <HorizontalCarousel
            title="Filmes populares"
            actionLabel="Ver todos"
            onAction={() => onNavigateCatalog('movie')}
          >
            {catalog.popularMovies.map((item) => (
              <div
                key={`mov-${item.id}`}
                className="w-[146px] sm:w-[172px] md:w-[190px] shrink-0 snap-start"
              >
                <MediaCard item={item} onSelect={onOpenDetail} />
              </div>
            ))}
          </HorizontalCarousel>
        )}

        {/* Séries populares */}
        {catalog.popularSeries.length > 0 && (
          <HorizontalCarousel
            title="Séries populares"
            actionLabel="Ver todas"
            onAction={() => onNavigateCatalog('series')}
          >
            {catalog.popularSeries.map((item) => (
              <div
                key={`ser-${item.id}`}
                className="w-[146px] sm:w-[172px] md:w-[190px] shrink-0 snap-start"
              >
                <MediaCard item={item} onSelect={onOpenDetail} />
              </div>
            ))}
          </HorizontalCarousel>
        )}

        {/* Adicionados recentemente */}
        {catalog.recentlyAdded.length > 0 && (
          <HorizontalCarousel title="Adicionados recentemente">
            {catalog.recentlyAdded.map((item) => (
              <div
                key={`rec-${item.type}-${item.id}`}
                className="w-[146px] sm:w-[172px] md:w-[190px] shrink-0 snap-start"
              >
                <MediaCard item={item} onSelect={onOpenDetail} />
              </div>
            ))}
          </HorizontalCarousel>
        )}

        {/* Minha lista */}
        {favorites.length > 0 && (
          <HorizontalCarousel
            title="Minha lista"
            actionLabel="Abrir lista"
            onAction={onNavigateMyList}
          >
            {favorites.slice(0, 14).map((item) => (
              <div
                key={`fav-${item.type}-${item.id}`}
                className="w-[146px] sm:w-[172px] md:w-[190px] shrink-0 snap-start"
              >
                <MediaCard
                  item={item}
                  onSelect={(selected) =>
                    selected.type === 'live'
                      ? onPlayItem(selected)
                      : onOpenDetail(selected)
                  }
                />
              </div>
            ))}
          </HorizontalCarousel>
        )}

        {/* TV ao vivo */}
        {catalog.liveChannels.length > 0 && (
          <HorizontalCarousel
            title="TV ao vivo"
            actionLabel="Ver canais"
            onAction={() => onNavigateCatalog('live')}
          >
            {catalog.liveChannels.map((ch) => (
              <div
                key={`live-${ch.id}`}
                className="w-[190px] sm:w-[230px] shrink-0 snap-start"
              >
                <MediaCard
                  aspect="landscape"
                  item={ch}
                  subtitleOverride={`Ao vivo · ${ch.categoryName || 'Canal'}`}
                  onSelect={() => onPlayItem(ch)}
                />
              </div>
            ))}
          </HorizontalCarousel>
        )}

        {/* Categorias */}
        {allCategories.length > 0 && (
          <section>
            <h2 className="font-display text-lg sm:text-xl font-semibold tracking-tight text-[#F3F6F4] mb-4">
              Categorias
            </h2>
            <div className="flex flex-wrap gap-2.5">
              {allCategories.map((cat) => (
                <button
                  key={`${cat.type}-${cat.id}`}
                  type="button"
                  onClick={() => onNavigateCatalog(cat.type, cat.id)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-white/[0.08] bg-[#0D1210] hover:border-emerald-500/45 hover:bg-[#121A16] text-sm font-medium text-[#D1DBD5] hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
