import React, {useRef} from 'react';
import {ChevronLeft, ChevronRight} from 'lucide-react';

interface HorizontalCarouselProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}

export const HorizontalCarousel: React.FC<HorizontalCarouselProps> = ({
  title,
  actionLabel,
  onAction,
  children,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollByAmount = (dir: 'left' | 'right') => {
    const el = trackRef.current;
    if (!el) return;
    const distance = Math.max(320, el.clientWidth * 0.78);
    el.scrollBy({
      left: dir === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  return (
    <section className="relative group/section">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="font-display text-lg sm:text-xl font-semibold tracking-tight text-[#F3F6F4]">
          {title}
        </h2>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="text-xs sm:text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {actionLabel}
          </button>
        )}
      </div>

      <div className="relative">
        {/* Desktop Scroll Arrows */}
        <button
          type="button"
          onClick={() => scrollByAmount('left')}
          className="hidden md:flex absolute left-0 top-[38%] -translate-y-1/2 -translate-x-3 z-20 h-10 w-10 items-center justify-center rounded-full bg-[#0D1210]/90 border border-white/10 text-white opacity-0 group-hover/section:opacity-100 hover:bg-emerald-600 hover:border-emerald-500 transition-all shadow-lg cursor-pointer"
          aria-label={`Rolar ${title} para a esquerda`}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div
          ref={trackRef}
          className="flex gap-3.5 sm:gap-4 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory pb-1"
        >
          {children}
        </div>

        <button
          type="button"
          onClick={() => scrollByAmount('right')}
          className="hidden md:flex absolute right-0 top-[38%] -translate-y-1/2 translate-x-3 z-20 h-10 w-10 items-center justify-center rounded-full bg-[#0D1210]/90 border border-white/10 text-white opacity-0 group-hover/section:opacity-100 hover:bg-emerald-600 hover:border-emerald-500 transition-all shadow-lg cursor-pointer"
          aria-label={`Rolar ${title} para a direita`}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
};
