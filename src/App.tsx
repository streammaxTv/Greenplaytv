import React, {useCallback, useEffect, useState} from 'react';
import {AccountModal} from './components/AccountModal';
import {Header, type AppRoute} from './components/Header';
import {OfflineIndicator} from './components/OfflineIndicator';
import {VideoPlayerModal} from './components/VideoPlayerModal';
import {getDemoHomeCatalog, getDemoItemDetail} from './data/demoCatalog';
import {useUserLibrary} from './hooks/useUserLibrary';
import {CatalogPage} from './pages/CatalogPage';
import {DetailPage} from './pages/DetailPage';
import {HomePage} from './pages/HomePage';
import {LiveTVPage} from './pages/LiveTVPage';
import {LoginPage} from './pages/LoginPage';
import {MyListPage} from './pages/MyListPage';
import {SearchPage} from './pages/SearchPage';
import {
  fetchHomeCatalog,
  fetchItemDetail,
  logoutIptv,
} from './services/iptvApi';
import type {
  AuthSessionInfo,
  ContinueWatchingEntry,
  EpisodeItem,
  HomeCatalogResponse,
  MediaItem,
  MediaType,
  PlayerTarget,
  SeriesDetail,
} from './types/catalog';

const DEMO_SESSION: AuthSessionInfo = {
  authenticated: false,
  mode: 'demo',
  accountLabel: 'Demonstração',
  capabilities: {live: false, movies: true, series: true},
};

export default function App() {
  const [session, setSession] = useState<AuthSessionInfo | null>(null);
  const [route, setRoute] = useState<AppRoute>('home');
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<string>('all');
  const [detailTarget, setDetailTarget] = useState<{
    type: 'movie' | 'series';
    id: string;
  } | null>(null);
  const [previousRoute, setPreviousRoute] = useState<AppRoute>('home');

  const [homeCatalog, setHomeCatalog] = useState<HomeCatalogResponse | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);

  const [playerTarget, setPlayerTarget] = useState<PlayerTarget | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);

  const accountScope = session?.authenticated
    ? `${session.mode}:${session.serverHost || ''}:${session.accountLabel}`
    : 'demo';

  const {
    favorites,
    history,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    upsertContinueWatching,
    getSavedPosition,
  } = useUserLibrary(accountScope);

  const isDemoMode = !session || session.mode === 'demo';

  const loadHome = useCallback(async (activeSession: AuthSessionInfo) => {
    if (activeSession.mode === 'demo') {
      setHomeCatalog(getDemoHomeCatalog());
      setHomeError(null);
      setHomeLoading(false);
      return;
    }

    setHomeLoading(true);
    setHomeError(null);
    try {
      const data = await fetchHomeCatalog();
      setHomeCatalog(data);
    } catch (err) {
      setHomeError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar o catálogo inicial.',
      );
    } finally {
      setHomeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      loadHome(session);
    }
  }, [session, loadHome]);

  const handleNavigate = (next: AppRoute) => {
    if (next !== 'detail') {
      setCatalogCategoryFilter('all');
    }
    setRoute(next);
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const handleNavigateCatalog = (type: MediaType, categoryId?: string) => {
    setCatalogCategoryFilter(categoryId || 'all');
    if (type === 'movie') setRoute('movies');
    else if (type === 'series') setRoute('series');
    else setRoute('live');
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const handleOpenDetail = (item: MediaItem) => {
    if (item.type === 'live') {
      handlePlayItem(item);
      return;
    }
    setPreviousRoute(route === 'detail' ? previousRoute : route);
    setDetailTarget({type: item.type, id: item.id});
    setRoute('detail');
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const handlePlayItem = async (item: MediaItem, resumeAtSeconds?: number) => {
    if (item.type === 'live') {
      setPlayerTarget({
        mediaType: 'live',
        id: item.id,
        title: item.title,
        subtitle: item.categoryName || 'TV ao vivo',
        poster: item.poster,
        banner: item.banner,
        streamUrl: item.streamUrl,
        streamFormat: item.streamFormat,
        isDemo: item.isDemo,
        channelsQueue: homeCatalog?.liveChannels,
      });
      return;
    }

    if (item.type === 'series') {
      try {
        const res = isDemoMode
          ? getDemoItemDetail('series', item.id)
          : await fetchItemDetail('series', item.id);
        const series = res?.item as SeriesDetail | undefined;
        if (series && series.seasons.length > 0) {
          const allEps = series.seasons.flatMap((s) => s.episodes);
          const saved = getSavedPosition(`series:${series.id}`);
          const targetEp =
            (saved?.episodeId && allEps.find((e) => e.id === saved.episodeId)) ||
            allEps[0];
          if (targetEp) {
            handlePlayEpisode(
              series,
              targetEp,
              allEps,
              saved?.episodeId === targetEp.id ? saved.positionSeconds : undefined,
            );
            return;
          }
        }
      } catch {
        // Fall through to detail page if series load fails
      }
      handleOpenDetail(item);
      return;
    }

    // Movie playback
    const saved = getSavedPosition(`movie:${item.id}`);
    setPlayerTarget({
      mediaType: 'movie',
      id: item.id,
      title: item.title,
      subtitle: [item.year, item.genres[0]].filter(Boolean).join(' · '),
      poster: item.poster,
      banner: item.banner,
      streamUrl: item.streamUrl,
      streamFormat: item.streamFormat,
      isDemo: item.isDemo,
      resumeAtSeconds: resumeAtSeconds ?? saved?.positionSeconds,
    });
  };

  const handlePlayEpisode = (
    series: SeriesDetail,
    episode: EpisodeItem,
    allEpisodes: EpisodeItem[],
    resumeAtSeconds?: number,
  ) => {
    setPlayerTarget({
      mediaType: 'series',
      id: series.id,
      seriesId: series.id,
      episodeId: episode.id,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      title: series.title,
      subtitle: `T${String(episode.seasonNumber).padStart(2, '0')} · E${String(episode.episodeNumber).padStart(2, '0')} — ${episode.title}`,
      poster: series.poster,
      banner: episode.thumbnail || series.banner || series.poster,
      streamUrl: episode.streamUrl,
      streamFormat: episode.streamFormat,
      isDemo: episode.isDemo ?? series.isDemo,
      episodesQueue: allEpisodes,
      resumeAtSeconds,
    });
  };

  const handlePlayChannel = (channel: MediaItem, queue?: MediaItem[]) => {
    setPlayerTarget({
      mediaType: 'live',
      id: channel.id,
      title: channel.title,
      subtitle: channel.categoryName || 'Transmissão ao vivo',
      poster: channel.poster,
      banner: channel.banner,
      streamUrl: channel.streamUrl,
      streamFormat: channel.streamFormat,
      isDemo: channel.isDemo,
      channelsQueue: queue,
    });
  };

  const handleResumeHistory = async (entry: ContinueWatchingEntry) => {
    if (entry.mediaType === 'series' && entry.seriesId) {
      const res = isDemoMode
        ? getDemoItemDetail('series', entry.seriesId)
        : await fetchItemDetail('series', entry.seriesId).catch(() => null);
      const series = res?.item as SeriesDetail | undefined;
      if (series && 'seasons' in series) {
        const allEps = series.seasons.flatMap((s) => s.episodes);
        const ep =
          allEps.find((e) => e.id === entry.episodeId) || allEps[0];
        if (ep) {
          handlePlayEpisode(series, ep, allEps, entry.positionSeconds);
          return;
        }
      }
    }

    if (entry.mediaType === 'movie') {
      const res = isDemoMode
        ? getDemoItemDetail('movie', entry.mediaId)
        : await fetchItemDetail('movie', entry.mediaId).catch(() => null);
      if (res?.item) {
        handlePlayItem(res.item, entry.positionSeconds);
        return;
      }
    }

    setPlayerTarget({
      mediaType: entry.mediaType,
      id: entry.mediaId,
      title: entry.title,
      poster: entry.poster,
      banner: entry.banner,
      isDemo: entry.isDemo,
      resumeAtSeconds: entry.positionSeconds,
    });
  };

  const handlePlayerProgress = useCallback(
    (positionSeconds: number, durationSeconds: number, current: PlayerTarget) => {
      if (current.mediaType === 'live') return;
      const key =
        current.mediaType === 'series'
          ? `series:${current.seriesId || current.id}`
          : `movie:${current.id}`;
      upsertContinueWatching({
        key,
        mediaType: current.mediaType,
        mediaId: current.id,
        seriesId: current.seriesId,
        episodeId: current.episodeId,
        seasonNumber: current.seasonNumber,
        episodeNumber: current.episodeNumber,
        episodeTitle: current.subtitle,
        title: current.title,
        poster: current.poster,
        banner: current.banner,
        positionSeconds,
        durationSeconds,
        updatedAt: Date.now(),
        isDemo: current.isDemo,
      });
    },
    [upsertContinueWatching],
  );

  const handleDisconnect = async () => {
    await logoutIptv();
    setSession(null);
    setHomeCatalog(null);
    setPlayerTarget(null);
    setRoute('home');
  };

  // Show IPTV Login screen until authenticated or user chooses Demo preview
  if (!session) {
    return (
      <>
        <LoginPage
          onAuthenticated={(authSession) => {
            setSession(authSession);
            setRoute('home');
          }}
          onEnterDemo={() => {
            setSession(DEMO_SESSION);
            setRoute('home');
          }}
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#060807] text-[#F3F6F4] flex flex-col">
      <Header
        activeRoute={route}
        onNavigate={handleNavigate}
        session={session}
        onOpenAccount={() => setShowAccountModal(true)}
      />

      <main className="flex-1 pb-20 md:pb-0">
        {route === 'home' && (
          <HomePage
            catalog={homeCatalog}
            loading={homeLoading}
            error={homeError}
            onRetry={() => loadHome(session)}
            favorites={favorites}
            history={history}
            onPlayItem={(item) => handlePlayItem(item)}
            onResumeHistory={handleResumeHistory}
            onOpenDetail={handleOpenDetail}
            onNavigateCatalog={handleNavigateCatalog}
            onNavigateMyList={() => handleNavigate('mylist')}
          />
        )}

        {route === 'movies' && (
          <CatalogPage
            mediaType="movie"
            isDemoMode={isDemoMode}
            initialCategoryId={catalogCategoryFilter}
            onSelectItem={handleOpenDetail}
          />
        )}

        {route === 'series' && (
          <CatalogPage
            mediaType="series"
            isDemoMode={isDemoMode}
            initialCategoryId={catalogCategoryFilter}
            onSelectItem={handleOpenDetail}
          />
        )}

        {route === 'live' && (
          <LiveTVPage
            isDemoMode={isDemoMode}
            initialCategoryId={catalogCategoryFilter}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            onPlayChannel={(ch, queue) => handlePlayChannel(ch, queue)}
            onConnectIptv={handleDisconnect}
          />
        )}

        {route === 'mylist' && (
          <MyListPage
            favorites={favorites}
            onSelectItem={handleOpenDetail}
            onRemoveFavorite={removeFavorite}
          />
        )}

        {route === 'search' && (
          <SearchPage
            isDemoMode={isDemoMode}
            onSelectMedia={handleOpenDetail}
            onPlayChannel={(ch) => handlePlayChannel(ch)}
            onSelectEpisodeSeries={(seriesId) => {
              setPreviousRoute('search');
              setDetailTarget({type: 'series', id: seriesId});
              setRoute('detail');
            }}
          />
        )}

        {route === 'detail' && detailTarget && (
          <DetailPage
            mediaType={detailTarget.type}
            mediaId={detailTarget.id}
            isDemoMode={isDemoMode}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            getSavedPosition={getSavedPosition}
            onPlayMovie={(movie, pos) => handlePlayItem(movie, pos)}
            onPlayEpisode={handlePlayEpisode}
            onSelectRelated={handleOpenDetail}
            onBack={() =>
              setRoute(previousRoute === 'detail' ? 'home' : previousRoute)
            }
          />
        )}
      </main>

      <footer className="hidden md:block border-t border-white/[0.06] py-6 px-10 text-xs text-[#6E7D75]">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4">
          <span>GreenPlay TV — Plataforma de Streaming IPTV</span>
          <span>
            {session.mode === 'demo'
              ? 'Modo Demonstração · Sem fontes de vídeo externas conectadas'
              : `Conectado a ${session.serverHost || session.accountLabel}`}
          </span>
        </div>
      </footer>

      {showAccountModal && (
        <AccountModal
          session={session}
          onClose={() => setShowAccountModal(false)}
          onDisconnect={handleDisconnect}
          onConnectList={handleDisconnect}
        />
      )}

      {playerTarget && (
        <VideoPlayerModal
          target={playerTarget}
          onClose={() => setPlayerTarget(null)}
          onProgress={handlePlayerProgress}
          onConnectIptv={handleDisconnect}
          onSelectEpisode={(ep) => {
            if (!playerTarget.episodesQueue) return;
            const saved = getSavedPosition(`series:${playerTarget.seriesId || playerTarget.id}`);
            setPlayerTarget({
              ...playerTarget,
              episodeId: ep.id,
              seasonNumber: ep.seasonNumber,
              episodeNumber: ep.episodeNumber,
              subtitle: `T${String(ep.seasonNumber).padStart(2, '0')} · E${String(ep.episodeNumber).padStart(2, '0')} — ${ep.title}`,
              banner: ep.thumbnail || playerTarget.banner,
              streamUrl: ep.streamUrl,
              streamFormat: ep.streamFormat,
              isDemo: ep.isDemo,
              resumeAtSeconds:
                saved?.episodeId === ep.id ? saved.positionSeconds : undefined,
            });
          }}
          onSelectChannel={(ch) => {
            setPlayerTarget({
              ...playerTarget,
              id: ch.id,
              title: ch.title,
              subtitle: ch.categoryName || 'Transmissão ao vivo',
              poster: ch.poster,
              banner: ch.banner,
              streamUrl: ch.streamUrl,
              streamFormat: ch.streamFormat,
              isDemo: ch.isDemo,
            });
          }}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
