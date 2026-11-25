import React from 'react';
import {Info, Play} from 'lucide-react';
import type {MediaItem} from '../types/catalog';
import {MediaImage} from './MediaImage';

interface HeroBannerProps {
  item: MediaItem;
  onPlay: (item: MediaItem) => void;
  onMoreInfo: (item: MediaItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({item, onPlay, onMoreInfo}) => {
  const metadataParts = [
    item.isDemo ? 'Demonstração' : item.type === 'series' ? 'Série' : item.type === 'live' ? 'Ao vivo' : 'Filme',
    item.year,
    item.genres[0],
    item.duration,
  ].filter(Boolean);

  return (
    <section className="relative w-full h-[62vh] min-h-[430px] max-h-[700px] overflow-hidden bg-[#060807]">
      {/* Backdrop Image */}
      <div className="absolute inset-0">
        <MediaImage
          src={item.banner || item.poster}
          alt={item.title}
          fallbackType={item.type}
          priority
          className="w-full h-full object-cover object-center scale-[1.02]"
        />
        {/* Measured contrast scrims for crisp readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#060807] via-[#060807]/55 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#060807]/95 via-[#060807]/60 to-transparent" />
      </div>

      {/* Hero Foreground Content */}
      <div className="relative z-10 h-full max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 flex flex-col justify-end pb-10 sm:pb-14 lg:pb-16">
        <div className="max-w-2xl">
          {/* Unboxed Metadata */}
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-medium text-emerald-300/90 mb-3">
            {metadataParts.map((part, idx) => (
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

          <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#F3F6F4] leading-[1.08] [text-wrap:balance] mb-4">
            {item.title}
          </h1>

          {item.description && (
            <p className="text-sm sm:text-base text-[#C3CEC8] leading-relaxed line-clamp-3 max-w-xl mb-7">
              {item.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onPlay(item)}
              className="inline-flex items-center justify-center gap-2.5 min-h-[46px] px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-[#04120B] font-semibold text-sm sm:text-base transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <Play className="h-4 w-4 fill-current shrink-0" />
              <span>Assistir</span>
            </button>

            <button
              type="button"
              onClick={() => onMoreInfo(item)}
              className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-3 rounded-xl border border-white/15 bg-white/[0.08] hover:bg-white/[0.14] active:scale-[0.98] text-[#F3F6F4] font-medium text-sm sm:text-base backdrop-blur-sm transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <Info className="h-4 w-4 shrink-0" />
              <span>Mais informações</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
