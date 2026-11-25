import React, {useEffect, useState} from 'react';
import {AlertCircle, Play, Search, X} from 'lucide-react';
import {MediaCard} from '../components/MediaCard';
import {GridSkeleton} from '../components/Skeletons';
import {searchDemoCatalog} from '../data/demoCatalog';
import {searchGlobalCatalog} from '../services/iptvApi';
import type {EpisodeItem, GlobalSearchResponse, MediaItem} from '../types/catalog';

interface SearchPageProps {
  isDemoMode: boolean;
  onSelectMedia: (item: MediaItem) => void;
  onPlayChannel: (channel: MediaItem) => void;
  onSelectEpisodeSeries: (seriesId: string) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  isDemoMode,
  onSelectMedia,
  onPlayChannel,
  onSelectEpisodeSeries,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const res = isDemoMode
          ? searchDemoCatalog(trimmed)
          : await searchGlobalCatalog(trimmed);
        setResults(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar no catálogo.');
      } finally {
        setLoading(false);
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [query, isDemoMode]);

  const totalMatches = results
    ? results.movies.length +
      results.series.length +
      results.episodes.length +
      results.live.length
    : 0;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 py-8 pb-16">
      <div className="max-w-2xl mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F3F6F4] mb-4">
          Buscar no catálogo
        </h1>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-400" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite o nome de um filme, série, episódio ou canal..."
            className="w-full min-h-[52px] pl-12 pr-12 rounded-2xl bg-[#0D1210] border border-white/15 focus:border-emerald-500 focus:outline-none text-base text-[#F3F6F4] placeholder:text-[#66756D]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#8C9B93] hover:text-white cursor-pointer"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-[#8C9B93]">
          Digite pelo menos 2 caracteres para buscar em todo o acervo conectado.
        </p>
      </div>

      {loading && <GridSkeleton count={12} />}

      {error && (
        <div className="py-12 text-center max-w-md mx-auto">
          <AlertCircle className="h-9 w-9 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-[#C3CEC8]">{error}</p>
        </div>
      )}

      {!loading && !error && results && totalMatches === 0 && (
        <div className="py-16 text-center max-w-md mx-auto">
          <Search className="h-10 w-10 text-emerald-500/40 mx-auto mb-3" />
          <h2 className="font-display text-lg font-semibold text-white">
            Nenhum resultado encontrado
          </h2>
          <p className="mt-2 text-sm text-[#9CA8A2]">
            Não encontramos filmes, séries, episódios ou canais para &ldquo;{query.trim()}&rdquo;.
          </p>
        </div>
      )}

      {!loading && !error && results && totalMatches > 0 && (
        <div className="space-y-10">
          {results.movies.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-semibold text-[#F3F6F4] mb-4">
                Filmes ({results.movies.length})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {results.movies.map((m) => (
                  <MediaCard key={`sm-${m.id}`} item={m} onSelect={onSelectMedia} />
                ))}
              </div>
            </section>
          )}

          {results.series.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-semibold text-[#F3F6F4] mb-4">
                Séries ({results.series.length})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {results.series.map((s) => (
                  <MediaCard key={`ss-${s.id}`} item={s} onSelect={onSelectMedia} />
                ))}
              </div>
            </section>
          )}

          {results.episodes.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-semibold text-[#F3F6F4] mb-4">
                Episódios ({results.episodes.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {results.episodes.map((ep: EpisodeItem & {seriesTitle: string}) => (
                  <button
                    key={`sep-${ep.id}`}
                    type="button"
                    onClick={() => onSelectEpisodeSeries(ep.seriesId)}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0D1210] border border-white/[0.06] hover:border-emerald-500/45 text-left transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-emerald-400 tabular-nums">
                        {ep.seriesTitle} · T{ep.seasonNumber}E{ep.episodeNumber}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-[#F3F6F4] truncate">
                        {ep.title}
                      </div>
                    </div>
                    <Play className="h-4 w-4 text-emerald-400 shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {results.live.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-semibold text-[#F3F6F4] mb-4">
                TV ao vivo ({results.live.length})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {results.live.map((ch) => (
                  <MediaCard
                    key={`sl-${ch.id}`}
                    aspect="landscape"
                    item={ch}
                    subtitleOverride="Ao vivo"
                    onSelect={onPlayChannel}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
