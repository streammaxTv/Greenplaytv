import React from 'react';

interface BrandLogoProps {
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({onClick, size = 'md'}) => {
  const iconSize = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';
  const textSize =
    size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-lg' : 'text-xl';

  const content = (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        viewBox="0 0 36 36"
        fill="none"
        className={iconSize}
        aria-hidden="true"
      >
        <rect
          x="1.5"
          y="1.5"
          width="33"
          height="33"
          rx="8.5"
          fill="#0D1210"
          stroke="#10B981"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />
        <path
          d="M13 10.7C13 9.75 14.04 9.17 14.85 9.66L26.25 16.46C27.04 16.93 27.04 18.07 26.25 18.54L14.85 25.34C14.04 25.83 13 25.25 13 24.3V10.7Z"
          fill="#10B981"
        />
        <path
          d="M13 10.7C13 9.75 14.04 9.17 14.85 9.66L21.5 13.63L13 18.6V10.7Z"
          fill="#34D399"
        />
        <rect
          x="10.5"
          y="28"
          width="15"
          height="1.75"
          rx="0.875"
          fill="#10B981"
          fillOpacity="0.6"
        />
      </svg>
      <span className={`font-display font-bold tracking-tight ${textSize}`}>
        <span className="text-emerald-400">Green</span>
        <span className="text-[#F3F6F4]">Play</span>
        <span className="ml-1.5 font-medium text-[#9CA8A2]">TV</span>
      </span>
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-lg cursor-pointer"
        aria-label="GreenPlay TV — Ir para Início"
      >
        {content}
      </button>
    );
  }

  return content;
};
