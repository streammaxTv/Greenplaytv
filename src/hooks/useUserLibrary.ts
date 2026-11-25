import {useCallback, useEffect, useState} from 'react';
import type {ContinueWatchingEntry, MediaItem} from '../types/catalog';

const STORAGE_PREFIX = 'greenplay_tv_library_v1';

interface StoredLibrary {
  favorites: MediaItem[];
  history: ContinueWatchingEntry[];
}

function getStorageKey(scope: string): string {
  return `${STORAGE_PREFIX}:${scope || 'demo'}`;
}

function readLibrary(scope: string): StoredLibrary {
  try {
    const raw = window.localStorage.getItem(getStorageKey(scope));
    if (!raw) return {favorites: [], history: []};
    const parsed = JSON.parse(raw) as Partial<StoredLibrary>;
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return {favorites: [], history: []};
  }
}

function writeLibrary(scope: string, data: StoredLibrary) {
  try {
    window.localStorage.setItem(getStorageKey(scope), JSON.stringify(data));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function useUserLibrary(accountScope: string) {
  const [library, setLibrary] = useState<StoredLibrary>(() => readLibrary(accountScope));

  useEffect(() => {
    setLibrary(readLibrary(accountScope));
  }, [accountScope]);

  const isFavorite = useCallback(
    (type: MediaItem['type'], id: string) =>
      library.favorites.some((item) => item.type === type && item.id === id),
    [library.favorites],
  );

  const toggleFavorite = useCallback(
    (item: MediaItem) => {
      setLibrary((prev) => {
        const exists = prev.favorites.some(
          (f) => f.type === item.type && f.id === item.id,
        );
        const nextFavorites = exists
          ? prev.favorites.filter((f) => !(f.type === item.type && f.id === item.id))
          : [item, ...prev.favorites];
        const next = {...prev, favorites: nextFavorites};
        writeLibrary(accountScope, next);
        return next;
      });
    },
    [accountScope],
  );

  const removeFavorite = useCallback(
    (type: MediaItem['type'], id: string) => {
      setLibrary((prev) => {
        const nextFavorites = prev.favorites.filter(
          (f) => !(f.type === type && f.id === id),
        );
        const next = {...prev, favorites: nextFavorites};
        writeLibrary(accountScope, next);
        return next;
      });
    },
    [accountScope],
  );

  const upsertContinueWatching = useCallback(
    (entry: ContinueWatchingEntry) => {
      setLibrary((prev) => {
        const filtered = prev.history.filter((h) => h.key !== entry.key);
        const nextHistory = [entry, ...filtered].slice(0, 30);
        const next = {...prev, history: nextHistory};
        writeLibrary(accountScope, next);
        return next;
      });
    },
    [accountScope],
  );

  const removeContinueWatching = useCallback(
    (key: string) => {
      setLibrary((prev) => {
        const nextHistory = prev.history.filter((h) => h.key !== key);
        const next = {...prev, history: nextHistory};
        writeLibrary(accountScope, next);
        return next;
      });
    },
    [accountScope],
  );

  const getSavedPosition = useCallback(
    (key: string): ContinueWatchingEntry | undefined =>
      library.history.find((h) => h.key === key),
    [library.history],
  );

  return {
    favorites: library.favorites,
    history: library.history,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    upsertContinueWatching,
    removeContinueWatching,
    getSavedPosition,
  };
}
