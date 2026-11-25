import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  Heart,
  Play,
  Plug,
  Radio,
  RotateCcw,
  Search,
} from 'lucide-react';
import {MediaImage} from '../components/MediaImage';
import {GridSkeleton} from '../components/Skeletons';
import {fetchCatalogPage, fetchOwnerLivePlaylist} from '../services/iptvApi';
import type {CategoryItem, MediaItem} from '../types/catalog';

interface LiveTVPageProps {
  isDemoMode: boolean;
  initialCategoryId?: string;
  isFavorite: (type: MediaItem['type'], id: string) => boolean;
  onToggleFavorite: (item: MediaItem) => void;
  onPlayChannel: (channel: MediaItem, allChannels: MediaItem[]) => void;
  onConnectIptv: () => void;
}

export const LiveTVPage: React.FC<LiveTVPageProps> = ({
  isDemoMode,
  initialCategoryId = 'all',
  isFavorite,
  onToggleFavorite,
  onPlayChannel,
  onConnectIptv,
}) => {
  const [channels, setChannels] = useState<MediaItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(initialCategoryId);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    setSelectedCategory(initialCategoryId);
    setPage(1);
  }, [initialCategoryId]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        if (isDemoMode) {
          const ownerRes = await fetchOwnerLivePlaylist();
          if (!active) return;
          if (!ownerRes.configured) {
            setChannels([]);
            setCategories([]);
            setTotalPages(1);
          } else {
            setCategories(ownerRes.categories);
            setChannels(ownerRes.channels);
            setTotalPages(1);
          }
        } else {
          const res = await fetchCatalogPage({
            type: 'live',
            categoryId: selectedCategory,
            q: searchQuery,
            page,
            limit: 48,
          });
          if (!active) return;
          setCategories(res.categories);
          setChannels((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
          setTotalPages(res.totalPages);
        }
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar canais de TV ao vivo.',
        );
      } finally {
        if (active) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [isDemoMode, selectedCategory, searchQuery, page, reloadTick]);

  const visibleChannels = useMemo(() => {
    if (!isDemoMode) return channels;
    return channels.filter((ch) => {
      const catOk = selectedCategory === 'all' || ch.categoryId === selectedCategory;
      const qOk =
        !searchQuery.trim() ||
        ch.title.toLowerCase().includes(searchQuery.trim().toLowerCase());
      return catOk && qOk;
    });
  }, [channels, isDemoMode, selectedCategory, searchQuery]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 py-8 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F3F6F4]">
            TV ao vivo
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#8C9B93]">
            Canais organizados por categoria com troca rápida direto no player.
          </p>
        </div>

        {(channels.length > 0 || !isDemoMode) && (
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#75847C]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar canal..."
              className="w-full min-h-[44px] pl-10 pr-4 rounded-xl bg-[#0D1210] border border-white/10 focus:border-emerald-500 focus:outline-none text-sm text-[#F3F6F4] placeholder:text-[#5F6D66]"
            />
          </div>
        )}
      </div>

      {/* Category Filter Strip */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-4 mb-6 border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('all');
              setPage(1);
            }}
            className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-emerald-500 text-[#04120B] font-semibold'
                : 'bg-[#0D1210] border border-white/[0.08] text-[#B7C4BC] hover:text-white'
            }`}
          >
            Todos os canais
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSelectedCategory(cat.id);
                setPage(1);
              }}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-emerald-500 text-[#04120B] font-semibold'
                  : 'bg-[#0D1210] border border-white/[0.08] text-[#B7C4BC] hover:text-white'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <GridSkeleton count={12} />
      ) : error ? (
        <div className="py-20 text-center max-w-md mx-auto">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h2 className="font-display text-lg font-semibold text-white">
            Não foi possível carregar os canais
          </h2>
          <p className="mt-2 text-sm text-[#9CA8A2]">{error}</p>
          <button
            type="button"
            onClick={() => setReloadTick((t) => t + 1)}
            className="mt-5 min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-[#04120B] font-semibold text-sm cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Tentar novamente</span>
          </button>
        </div>
      ) : visibleChannels.length === 0 ? (
        /* Professional Unconfigured / Empty Live TV Screen */
        <div className="my-8 rounded-2xl border border-white/[0.08] bg-[#0D1210] p-8 sm:p-12 text-center max-w-2xl mx-auto">
          <div className="mx-auto mb-5 h-14 w-14 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
            <Radio className="h-7 w-7 text-emerald-400" />
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#F3F6F4]">
            {isDemoMode
              ? 'Programação ao vivo ainda não conectada'
              : 'Nenhum canal encontrado nesta seleção'}
          </h2>
          <p className="mt-3 text-sm text-[#9CA8A2] leading-relaxed max-w-lg mx-auto">
            {isDemoMode
              ? 'O GreenPlay TV não exibe canais fictícios ou transmissões sem fonte legítima. Conecte suas credenciais IPTV (Xtream Codes ou lista M3U) ou configure uma playlist autorizada no servidor.'
              : 'Nenhum canal corresponde ao filtro ou busca informada.'}
          </p>
          {isDemoMode && (
            <button
              type="button"
              onClick={onConnectIptv}
              className="mt-6 min-h-[46px] inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#04120B] font-semibold text-sm transition-colors cursor-pointer"
            >
              <Plug className="h-4 w-4" />
              <span>Conectar lista IPTV</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
            {visibleChannels.map((ch) => {
              const fav = isFavorite('live', ch.id);
              return (
                <div
                  key={ch.id}
                  className="group flex items-center gap-3.5 p-3.5 rounded-xl bg-[#0D1210] border border-white/[0.06] hover:border-emerald-500/45 transition-all"
                >
                  <button
                    type="button"
                    onClick={() => onPlayChannel(ch, visibleChannels)}
                    className="flex-1 min-w-0 flex items-center gap-3.5 text-left cursor-pointer"
                  >
                    <div className="h-14 w-20 rounded-lg overflow-hidden bg-[#060807] border border-white/[0.05] shrink-0 flex items-center justify-center">
                      <MediaImage
                        src={ch.poster}
                        alt={ch.title}
                        fallbackType="live"
                        className="w-full h-full object-contain p-1.5"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px] font-medium text-emerald-400">
                        {ch.channelNumber && (
                          <span className="font-mono tabular-nums text-[#8C9B93]">
                            CH {String(ch.channelNumber).padStart(2, '0')}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          AO VIVO
                        </span>
                      </div>
                      <h3 className="mt-0.5 text-sm font-semibold text-[#F3F6F4] group-hover:text-emerald-300 transition-colors truncate">
                        {ch.title}
                      </h3>
                      {ch.categoryName && (
                        <p className="text-xs text-[#8C9B93] truncate">{ch.categoryName}</p>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(ch)}
                      className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                        fav
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : 'text-[#8C9B93] hover:text-white hover:bg-white/[0.06]'
                      }`}
                      aria-label={fav ? 'Remover dos favoritos' : 'Favoritar canal'}
                    >
                      <Heart className={`h-4 w-4 ${fav ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onPlayChannel(ch, visibleChannels)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-[#04120B] transition-colors cursor-pointer"
                      aria-label={`Assistir ${ch.title}`}
                    >
                      <Play className="h-4 w-4 fill-current ml-0.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {!isDemoMode && page < totalPages && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => setPage((p) => p + 1)}
                className="min-h-[46px] px-7 py-2.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {loadingMore ? 'Carregando...' : 'Carregar mais canais'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
