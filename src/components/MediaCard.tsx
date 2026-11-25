import React from 'react';
import {Play} from 'lucide-react';
import type {MediaItem} from '../types/catalog';
import {MediaImage} from './MediaImage';

interface MediaCardProps {
  item: MediaItem;
  onSelect: (item: MediaItem) => void;
  progressPercent?: number;
  subtitleOverride?: string;
  aspect?: 'poster' | 'landscape';
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  onSelect,
  progressPercent,
  subtitleOverride,
  aspect = 'poster',
}) => {
  const aspectClass = aspect === 'landscape' ? 'aspect-video' : 'aspect-[2/3]';
  const subtitleParts = subtitleOverride
    ? [subtitleOverride]
    : [
        item.year,
        item.genres[0] || item.categoryName,
        item.isDemo ? 'Demonstração' : undefined,
      ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="group text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-xl cursor-pointer"
    >
      <div
        className={`relative w-full ${aspectClass} rounded-xl overflow-hidden bg-[#0D1210] border border-white/[0.06] group-hover:border-emerald-500/45 transition-all duration-200`}
      >
        <MediaImage
          src={aspect === 'landscape' ? item.banner || item.poster : item.poster}
          alt={item.title}
          fallbackType={item.type}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />

        {/* Hover play affordance */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-end p-3">
          <span className="h-9 w-9 rounded-full bg-emerald-500 text-[#04120B] flex items-center justify-center shadow-lg">
            <Play className="h-4 w-4 fill-current ml-0.5" />
          </span>
        </div>

        {/* Resume progress bar (for Continue Watching) */}
        {typeof progressPercent === 'number' && progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15">
            <div
              className="h-full bg-emerald-400"
              style={{width: `${Math.min(100, Math.max(4, progressPercent))}%`}}
            />
          </div>
        )}
      </div>

      {/* Clean unboxed title & metadata below poster */}
      <div className="mt-2.5 px-0.5">
        <h3 className="text-sm font-semibold text-[#F3F6F4] group-hover:text-emerald-300 transition-colors line-clamp-1">
          {item.title}
        </h3>
        {subtitleParts.length > 0 && (
          <p className="mt-0.5 text-xs text-[#8C9B93] line-clamp-1 tabular-nums">
            {subtitleParts.join(' · ')}
          </p>
        )}
      </div>
    </button>
  );
};
