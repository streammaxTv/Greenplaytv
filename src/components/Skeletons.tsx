import React from 'react';

export const HeroSkeleton: React.FC = () => (
  <div className="relative w-full h-[58vh] min-h-[420px] max-h-[680px] bg-[#0B100E] overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-r from-[#060807] via-[#0D1411] to-[#060807] animate-pulse" />
    <div className="relative z-10 h-full max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 flex flex-col justify-end pb-12 sm:pb-16">
      <div className="h-3 w-32 rounded bg-white/10 mb-4" />
      <div className="h-10 sm:h-12 w-2/3 max-w-lg rounded bg-white/10 mb-4" />
      <div className="h-4 w-full max-w-md rounded bg-white/10 mb-2" />
      <div className="h-4 w-4/5 max-w-sm rounded bg-white/10 mb-7" />
      <div className="flex gap-3">
        <div className="h-11 w-36 rounded-lg bg-emerald-500/20" />
        <div className="h-11 w-40 rounded-lg bg-white/10" />
      </div>
    </div>
  </div>
);

export const RowSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="h-6 w-44 rounded bg-white/10 animate-pulse" />
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
      {Array.from({length: 6}).map((_, i) => (
        <div key={i} className="space-y-2.5 animate-pulse">
          <div className="aspect-[2/3] rounded-xl bg-[#101714] border border-white/[0.04]" />
          <div className="h-3.5 w-3/4 rounded bg-white/10" />
          <div className="h-3 w-1/2 rounded bg-white/[0.06]" />
        </div>
      ))}
    </div>
  </div>
);

export const GridSkeleton: React.FC<{count?: number}> = ({count = 12}) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
    {Array.from({length: count}).map((_, i) => (
      <div key={i} className="space-y-2.5 animate-pulse">
        <div className="aspect-[2/3] rounded-xl bg-[#101714] border border-white/[0.04]" />
        <div className="h-3.5 w-3/4 rounded bg-white/10" />
        <div className="h-3 w-1/2 rounded bg-white/[0.06]" />
      </div>
    ))}
  </div>
);
