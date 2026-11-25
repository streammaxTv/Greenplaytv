import React, {useMemo, useState} from 'react';
import {Bookmark, Trash2} from 'lucide-react';
import {MediaCard} from '../components/MediaCard';
import type {MediaItem, MediaType} from '../types/catalog';

interface MyListPageProps {
  favorites: MediaItem[];
  onSelectItem: (item: MediaItem) => void;
  onRemoveFavorite: (type: MediaType, id: string) => void;
}

export const MyListPage: React.FC<MyListPageProps> = ({
  favorites,
  onSelectItem,
  onRemoveFavorite,
}) => {
  const [filter, setFilter] = useState<'all' | MediaType>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return favorites;
    return favorites.filter((f) => f.type === filter);
  }, [favorites, filter]);

  const tabs: {key: 'all' | MediaType; label: string}[] = [
    {key: 'all', label: 'Todos'},
    {key: 'movie', label: 'Filmes'},
    {key: 'series', label: 'Séries'},
    {key: 'live', label: 'TV ao vivo'},
  ];

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 py-8 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F3F6F4]">
            Minha lista
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#8C9B93] tabular-nums">
            {favorites.length} {favorites.length === 1 ? 'item salvo' : 'itens salvos'}
          </p>
        </div>

        {favorites.length > 0 && (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#0D1210] border border-white/[0.06] overflow-x-auto no-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`min-h-[38px] px-3.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  filter === tab.key
                    ? 'bg-emerald-500 text-[#04120B] font-semibold'
                    : 'text-[#9CA8A2] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center max-w-md mx-auto">
          <div className="mx-auto mb-4 h-12 w-12 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 flex items-center justify-center">
            <Bookmark className="h-6 w-6 text-emerald-400" />
          </div>
          <h2 className="font-display text-lg font-semibold text-white">
            Sua lista está vazia
          </h2>
          <p className="mt-2 text-sm text-[#9CA8A2]">
            Adicione filmes, séries e canais favoritos para acessá-los rapidamente por aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
          {filtered.map((item) => (
            <div key={`fav-${item.type}-${item.id}`} className="relative group">
              <MediaCard item={item} onSelect={onSelectItem} />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFavorite(item.type, item.id);
                }}
                className="absolute top-2 right-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-black/75 border border-white/15 text-[#E2EAE5] hover:bg-red-600 hover:border-red-500 hover:text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-all cursor-pointer"
                aria-label={`Remover ${item.title} da minha lista`}
                title="Remover da minha lista"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
