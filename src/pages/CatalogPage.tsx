import React, {useEffect, useState} from 'react';
import {AlertCircle, Film, RotateCcw, Search, Tv} from 'lucide-react';
import {MediaCard} from '../components/MediaCard';
import {GridSkeleton} from '../components/Skeletons';
import {getDemoCatalogPage} from '../data/demoCatalog';
import {fetchCatalogPage} from '../services/iptvApi';
import type {MediaItem, PaginatedCatalogResponse} from '../types/catalog';

interface CatalogPageProps {
  mediaType: 'movie' | 'series';
  isDemoMode: boolean;
  initialCategoryId?: string;
  onSelectItem: (item: MediaItem) => void;
}

export const CatalogPage: React.FC<CatalogPageProps> = ({
  mediaType,
  isDemoMode,
  initialCategoryId = 'all',
  onSelectItem,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [genre, setGenre] = useState('all');
  const [year, setYear] = useState('all');
  const [sort, setSort] = useState('default');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<PaginatedCatalogResponse | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    setCategoryId(initialCategoryId);
    setGenre('all');
    setYear('all');
    setSearchInput('');
    setDebouncedQuery('');
    setPage(1);
  }, [mediaType, initialCategoryId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchInput);
      setPage(1);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const res = isDemoMode
          ? getDemoCatalogPage({
              type: mediaType,
              categoryId,
              q: debouncedQuery,
              genre,
              year,
              sort,
              page,
              limit: 36,
            })
          : await fetchCatalogPage({
              type: mediaType,
              categoryId,
              q: debouncedQuery,
              genre,
              year,
              sort,
              page,
              limit: 36,
            });

        if (!active) return;
        setData(res);
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Falha ao carregar o catálogo.',
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
  }, [mediaType, isDemoMode, categoryId, debouncedQuery, genre, year, sort, page, reloadTick]);

  const title = mediaType === 'movie' ? 'Filmes' : 'Séries';
  const Icon = mediaType === 'movie' ? Film : Tv;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 py-8 pb-16">
      {/* Page Header & Filters */}
      <div className="flex flex-col gap-5 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F3F6F4]">
              {title}
            </h1>
            {data && (
              <p className="mt-1 text-xs sm:text-sm text-[#8C9B93] tabular-nums">
                {data.total} {data.total === 1 ? 'título disponível' : 'títulos disponíveis'}
              </p>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#75847C]" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={`Buscar ${mediaType === 'movie' ? 'filmes' : 'séries'} por título...`}
              className="w-full min-h-[44px] pl-10 pr-4 rounded-xl bg-[#0D1210] border border-white/10 focus:border-emerald-500 focus:outline-none text-sm text-[#F3F6F4] placeholder:text-[#5F6D66]"
            />
          </div>

          <select
            aria-label="Filtrar por categoria"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#0D1210] border border-white/10 focus:border-emerald-500 focus:outline-none text-sm text-[#E2EAE5]"
          >
            <option value="all">Todas as categorias</option>
            {data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por gênero"
            value={genre}
            onChange={(e) => {
              setGenre(e.target.value);
              setPage(1);
            }}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#0D1210] border border-white/10 focus:border-emerald-500 focus:outline-none text-sm text-[#E2EAE5]"
          >
            <option value="all">Todos os gêneros</option>
            {data?.genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
            {data && data.years.length > 0 && (
              <select
                aria-label="Filtrar por ano"
                value={year}
                onChange={(e) => {
                  setYear(e.target.value);
                  setPage(1);
                }}
                className="min-h-[44px] px-3 rounded-xl bg-[#0D1210] border border-white/10 focus:border-emerald-500 focus:outline-none text-sm text-[#E2EAE5] lg:hidden"
              >
                <option value="all">Ano</option>
                {data.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}

            <select
              aria-label="Ordenar catálogo"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="min-h-[44px] px-3.5 rounded-xl bg-[#0D1210] border border-white/10 focus:border-emerald-500 focus:outline-none text-sm text-[#E2EAE5]"
            >
              <option value="default">Ordenação padrão</option>
              <option value="recent">Mais recentes</option>
              <option value="title_asc">Título (A–Z)</option>
              <option value="title_desc">Título (Z–A)</option>
              <option value="year_desc">Ano (mais novos)</option>
            </select>
          </div>
        </div>

        {/* Desktop Year Filter Row when years exist */}
        {data && data.years.length > 0 && (
          <div className="hidden lg:flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-xs text-[#8C9B93] mr-1 shrink-0">Ano:</span>
            <button
              type="button"
              onClick={() => {
                setYear('all');
                setPage(1);
              }}
              className={`min-h-[34px] px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                year === 'all'
                  ? 'bg-emerald-500 text-[#04120B] font-semibold'
                  : 'bg-[#0D1210] text-[#9CA8A2] hover:text-white border border-white/[0.06]'
              }`}
            >
              Todos
            </button>
            {data.years.slice(0, 14).map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => {
                  setYear(y);
                  setPage(1);
                }}
                className={`min-h-[34px] px-3 rounded-lg text-xs font-mono tabular-nums transition-colors cursor-pointer shrink-0 ${
                  year === y
                    ? 'bg-emerald-500 text-[#04120B] font-semibold'
                    : 'bg-[#0D1210] text-[#9CA8A2] hover:text-white border border-white/[0.06]'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content Grid */}
      {loading ? (
        <GridSkeleton count={18} />
      ) : error ? (
        <div className="py-20 text-center max-w-md mx-auto">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h2 className="font-display text-lg font-semibold text-white">
            Erro ao carregar {title.toLowerCase()}
          </h2>
          <p className="mt-2 text-sm text-[#9CA8A2]">{error}</p>
          <button
            type="button"
            onClick={() => setReloadTick((t) => t + 1)}
            className="mt-5 min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#04120B] font-semibold text-sm cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Tentar novamente</span>
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center max-w-md mx-auto">
          <Icon className="h-10 w-10 text-emerald-500/40 mx-auto mb-3" />
          <h2 className="font-display text-lg font-semibold text-white">
            Nenhum título encontrado
          </h2>
          <p className="mt-2 text-sm text-[#9CA8A2]">
            Tente ajustar sua busca ou remover alguns filtros ativos.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
            {items.map((item) => (
              <MediaCard
                key={`${item.type}-${item.id}`}
                item={item}
                onSelect={onSelectItem}
              />
            ))}
          </div>

          {data && data.page < data.totalPages && (
            <div className="mt-10 flex flex-col items-center gap-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => setPage((p) => p + 1)}
                className="min-h-[46px] px-7 py-2.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {loadingMore ? 'Carregando...' : 'Carregar mais títulos'}
              </button>
              <span className="text-xs text-[#75847C] tabular-nums">
                Página {data.page} de {data.totalPages}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
