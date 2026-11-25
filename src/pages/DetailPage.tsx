import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  Check,
  Play,
  RotateCcw,
} from 'lucide-react';
import {HorizontalCarousel} from '../components/HorizontalCarousel';
import {MediaCard} from '../components/MediaCard';
import {MediaImage} from '../components/MediaImage';
import {HeroSkeleton} from '../components/Skeletons';
import {getDemoItemDetail} from '../data/demoCatalog';
import {fetchItemDetail} from '../services/iptvApi';
import type {
  ContinueWatchingEntry,
  EpisodeItem,
  MediaItem,
  SeriesDetail,
} from '../types/catalog';

interface DetailPageProps {
  mediaType: 'movie' | 'series';
  mediaId: string;
  isDemoMode: boolean;
  isFavorite: (type: MediaItem['type'], id: string) => boolean;
  onToggleFavorite: (item: MediaItem) => void;
  getSavedPosition: (key: string) => ContinueWatchingEntry | undefined;
  onPlayMovie: (movie: MediaItem, resumeAtSeconds?: number) => void;
  onPlayEpisode: (
    series: SeriesDetail,
    episode: EpisodeItem,
    allEpisodes: EpisodeItem[],
    resumeAtSeconds?: number,
  ) => void;
  onSelectRelated: (item: MediaItem) => void;
  onBack: () => void;
}

export const DetailPage: React.FC<DetailPageProps> = ({
  mediaType,
  mediaId,
  isDemoMode,
  isFavorite,
  onToggleFavorite,
  getSavedPosition,
  onPlayMovie,
  onPlayEpisode,
  onSelectRelated,
  onBack,
}) => {
  const [item, setItem] = useState<MediaItem | SeriesDetail | null>(null);
  const [related, setRelated] = useState<MediaItem[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = isDemoMode
          ? getDemoItemDetail(mediaType, mediaId)
          : await fetchItemDetail(mediaType, mediaId);
        if (!active) return;
        if (!res) {
          setError('Conteúdo não encontrado.');
          return;
        }
        setItem(res.item);
        setRelated(res.related);
        if (res.item.type === 'series' && 'seasons' in res.item && res.item.seasons.length > 0) {
          setSelectedSeason(res.item.seasons[0].seasonNumber);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [mediaType, mediaId, isDemoMode, reloadTick]);

  const seriesDetail = item && 'seasons' in item ? (item as SeriesDetail) : null;
  const allEpisodes = useMemo(
    () => (seriesDetail ? seriesDetail.seasons.flatMap((s) => s.episodes) : []),
    [seriesDetail],
  );
  const activeSeason = useMemo(
    () =>
      seriesDetail?.seasons.find((s) => s.seasonNumber === selectedSeason) ||
      seriesDetail?.seasons[0],
    [seriesDetail, selectedSeason],
  );

  if (loading) {
    return <HeroSkeleton />;
  }

  if (error || !item) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <h2 className="font-display text-xl font-semibold text-white">
          Conteúdo indisponível
        </h2>
        <p className="mt-2 text-sm text-[#9CA8A2]">{error || 'Item não localizado.'}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setReloadTick((t) => t + 1)}
            className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-[#04120B] font-semibold text-sm cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Tentar novamente</span>
          </button>
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] px-5 py-2.5 rounded-xl border border-white/15 bg-white/[0.06] text-white text-sm cursor-pointer"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const savedMovieEntry =
    item.type === 'movie' ? getSavedPosition(`movie:${item.id}`) : undefined;
  const savedSeriesEntry =
    item.type === 'series' ? getSavedPosition(`series:${item.id}`) : undefined;

  const fav = isFavorite(item.type, item.id);

  const metaParts = [
    item.isDemo ? 'Demonstração' : item.type === 'series' ? 'Série' : 'Filme',
    item.year,
    item.genres.slice(0, 3).join(', '),
    item.duration,
  ].filter(Boolean);

  const handlePrimaryPlay = () => {
    if (seriesDetail) {
      const targetEp =
        (savedSeriesEntry?.episodeId &&
          allEpisodes.find((e) => e.id === savedSeriesEntry.episodeId)) ||
        allEpisodes[0];
      if (targetEp) {
        onPlayEpisode(
          seriesDetail,
          targetEp,
          allEpisodes,
          savedSeriesEntry?.episodeId === targetEp.id
            ? savedSeriesEntry.positionSeconds
            : undefined,
        );
      }
      return;
    }
    onPlayMovie(item, savedMovieEntry?.positionSeconds);
  };

  return (
    <div className="pb-16">
      {/* Banner Backdrop */}
      <div className="relative w-full min-h-[440px] sm:min-h-[520px] overflow-hidden bg-[#060807]">
        <MediaImage
          src={item.banner || item.poster}
          alt={item.title}
          fallbackType={item.type}
          priority
          className="absolute inset-0 w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060807] via-[#060807]/75 to-black/45" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#060807] via-[#060807]/70 to-transparent" />

        <div className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 pt-6 pb-10 sm:pb-14">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-sm font-medium text-[#E2EAE5] transition-colors mb-8 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar</span>
          </button>

          <div className="flex flex-col md:flex-row gap-6 sm:gap-8 items-start md:items-end">
            <div className="w-36 sm:w-48 lg:w-56 aspect-[2/3] rounded-xl overflow-hidden border border-white/10 bg-[#0D1210] shadow-2xl shrink-0">
              <MediaImage
                src={item.poster}
                alt={item.title}
                fallbackType={item.type}
                priority
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 min-w-0 max-w-2xl">
              {/* Unboxed Metadata */}
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-medium text-emerald-300/90 mb-2.5">
                {metaParts.map((part, idx) => (
                  <React.Fragment key={`${part}-${idx}`}>
                    {idx > 0 && (
                      <span className="text-[#6E7D75]" aria-hidden="true">
                        ·
                      </span>
                    )}
                    <span>{part}</span>
                  </React.Fragment>
                ))}
              </div>

              <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F3F6F4] leading-[1.1] [text-wrap:balance]">
                {item.title}
              </h1>

              <p className="mt-4 text-sm sm:text-base text-[#C3CEC8] leading-relaxed">
                {item.description || 'Nenhuma sinopse detalhada fornecida pelo catálogo.'}
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handlePrimaryPlay}
                  className="min-h-[46px] inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#04120B] font-semibold text-sm sm:text-base transition-colors cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-current shrink-0" />
                  <span>
                    {savedMovieEntry || savedSeriesEntry ? 'Retomar reprodução' : 'Assistir'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleFavorite(item)}
                  className={`min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border text-sm sm:text-base font-medium transition-colors cursor-pointer ${
                    fav
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-[#F3F6F4]'
                  }`}
                >
                  {fav ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  <span>{fav ? 'Na minha lista' : 'Adicionar à minha lista'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Seasons & Episodes Section (for Series) */}
      {seriesDetail && (
        <section className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 mt-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
            <h2 className="font-display text-xl font-semibold text-[#F3F6F4]">
              Temporadas e episódios
            </h2>

            {seriesDetail.seasons.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {seriesDetail.seasons.map((season) => {
                  const active = season.seasonNumber === activeSeason?.seasonNumber;
                  return (
                    <button
                      key={season.seasonNumber}
                      type="button"
                      onClick={() => setSelectedSeason(season.seasonNumber)}
                      className={`min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        active
                          ? 'bg-emerald-500 text-[#04120B] font-semibold'
                          : 'bg-[#0D1210] border border-white/[0.08] text-[#B7C4BC] hover:text-white'
                      }`}
                    >
                      {season.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!activeSeason || activeSeason.episodes.length === 0 ? (
            <p className="py-10 text-sm text-[#8C9B93]">
              Nenhum episódio listado para esta série no catálogo conectado.
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeSeason.episodes.map((ep) => {
                const isLastWatched = savedSeriesEntry?.episodeId === ep.id;
                const progressPct =
                  isLastWatched &&
                  savedSeriesEntry.durationSeconds > 0
                    ? Math.round(
                        (savedSeriesEntry.positionSeconds /
                          savedSeriesEntry.durationSeconds) *
                          100,
                      )
                    : 0;

                return (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() =>
                      onPlayEpisode(
                        seriesDetail,
                        ep,
                        allEpisodes,
                        isLastWatched ? savedSeriesEntry?.positionSeconds : undefined,
                      )
                    }
                    className="group text-left flex gap-4 p-3 rounded-xl bg-[#0D1210] border border-white/[0.06] hover:border-emerald-500/40 transition-all cursor-pointer"
                  >
                    <div className="relative w-32 sm:w-40 aspect-video rounded-lg overflow-hidden bg-[#070A08] shrink-0">
                      <MediaImage
                        src={ep.thumbnail || seriesDetail.banner || seriesDetail.poster}
                        alt={ep.title}
                        fallbackType="series"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/35 flex items-center justify-center opacity-80 group-hover:opacity-100">
                        <span className="h-9 w-9 rounded-full bg-emerald-500/90 text-[#04120B] flex items-center justify-center">
                          <Play className="h-4 w-4 fill-current ml-0.5" />
                        </span>
                      </div>
                      {progressPct > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                          <div
                            className="h-full bg-emerald-400"
                            style={{width: `${Math.min(100, progressPct)}%`}}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-emerald-400 font-mono tabular-nums">
                        <span>
                          T{String(ep.seasonNumber).padStart(2, '0')} · E{String(ep.episodeNumber).padStart(2, '0')}
                        </span>
                        {ep.duration && (
                          <span className="text-[#8C9B93]">{ep.duration}</span>
                        )}
                      </div>
                      <h3 className="mt-1 text-sm sm:text-base font-semibold text-[#F3F6F4] group-hover:text-emerald-300 transition-colors line-clamp-1">
                        {ep.title}
                      </h3>
                      {ep.description && (
                        <p className="mt-1 text-xs text-[#9CA8A2] line-clamp-2 leading-relaxed">
                          {ep.description}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Related Content */}
      {related.length > 0 && (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 mt-12">
          <HorizontalCarousel title="Conteúdos relacionados">
            {related.map((rel) => (
              <div
                key={`rel-${rel.type}-${rel.id}`}
                className="w-[146px] sm:w-[172px] md:w-[190px] shrink-0 snap-start"
              >
                <MediaCard item={rel} onSelect={onSelectRelated} />
              </div>
            ))}
          </HorizontalCarousel>
        </div>
      )}
    </div>
  );
};
