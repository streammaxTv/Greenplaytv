import React, {useEffect, useState} from 'react';
import {Film, Tv} from 'lucide-react';

interface MediaImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackType?: 'movie' | 'series' | 'live';
  priority?: boolean;
}

export const MediaImage: React.FC<MediaImageProps> = ({
  src,
  alt,
  className = '',
  fallbackType = 'movie',
  priority = false,
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#0F1814] via-[#0B100E] to-[#070A08] text-[#6E7D75] p-4 text-center select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        {fallbackType === 'live' ? (
          <Tv className="h-7 w-7 text-emerald-500/45 mb-2 shrink-0" />
        ) : (
          <Film className="h-7 w-7 text-emerald-500/45 mb-2 shrink-0" />
        )}
        <span className="text-xs font-medium text-[#9CA8A2] line-clamp-2 max-w-[16ch]">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
