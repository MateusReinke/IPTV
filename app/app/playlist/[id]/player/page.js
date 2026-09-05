'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { usePlaylist } from '@/lib/playlists';
import { useHydrated } from '@/lib/library';
import {
  formatClock,
  markCompleted,
  readHistoryEntry,
  recordPlayback,
  resumePosition,
  saveProgress,
} from '@/lib/history';
import { playableUrl, xtreamRequest } from '@/lib/xtream';
import { goBack } from '@/lib/nav';
import VideoPlayer from '@/components/VideoPlayer';
import { usePlaybackSlot } from '@/components/PlaybackProvider';
import { useFeature } from '@/components/SessionProvider';
import UpgradeNotice from '@/components/UpgradeNotice';
import { ErrorState, LoadingState } from '@/components/StateMessage';
import styles from './page.module.css';

const IDLE_HIDE_DELAY = 3500;
const RESUME_NOTICE_MS = 5000;

export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <div className={styles.stateWrap}>
            <LoadingState label="Carregando..." />
          </div>
        </main>
      }
    >
      <PlayerContent />
    </Suspense>
  );
}

function PlayerContent() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const playlist = usePlaylist(id);
  const hydrated = useHydrated();

  const type = searchParams.get('type');
  const streamId = searchParams.get('streamId');
  const ext = searchParams.get('ext') || (type === 'live' ? 'm3u8' : 'mp4');
  const title = searchParams.get('title') || 'Reproduzindo';
  const seriesId = searchParams.get('seriesId');
  const poster = searchParams.get('poster') || '';
  const kind = type === 'movie' ? 'movie' : type === 'series' ? 'series' : 'live';

  const [controlsVisible, setControlsVisible] = useState(true);
  const [noticeDoneFor, setNoticeDoneFor] = useState(null);
  const idleTimerRef = useRef(null);

  // One picture on screen = one lease. The token that comes back is what lets
  // /api/stream serve bytes, so a plan at its screen limit lands here.
  const { token, tokenRef, error: slotError, retry: retrySlot } = usePlaybackSlot(
    'player',
    title,
    !!streamId
  );
  const canSaveHistory = useFeature('history');

  const armIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setControlsVisible(false), IDLE_HIDE_DELAY);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    armIdleTimer();
  }, [armIdleTimer]);

  const { data: seriesData } = useSWR(
    playlist && type === 'series' && seriesId
      ? ['xtream-series-info', playlist.id, seriesId]
      : null,
    () => xtreamRequest(playlist, 'get_series_info', { series_id: seriesId })
  );

  const flatEpisodes = useMemo(() => {
    if (!seriesData?.episodes) return [];
    const seasonKeys = Object.keys(seriesData.episodes).sort((a, b) => Number(a) - Number(b));
    const flat = [];
    for (const season of seasonKeys) {
      for (const ep of seriesData.episodes[season]) {
        flat.push({ ...ep, season });
      }
    }
    return flat;
  }, [seriesData]);

  const currentIndex = flatEpisodes.findIndex((ep) => String(ep.id) === String(streamId));
  const currentEpisode = currentIndex >= 0 ? flatEpisodes[currentIndex] : null;
  const prevEpisode = currentIndex > 0 ? flatEpisodes[currentIndex - 1] : null;
  const nextEpisode =
    currentIndex >= 0 && currentIndex < flatEpisodes.length - 1
      ? flatEpisodes[currentIndex + 1]
      : null;
  const seriesName = seriesData?.info?.name || '';
  const seriesPoster = seriesData?.info?.cover || poster;

  // The resume point is read once per stream, on purpose: subscribing to the
  // live history entry would feed the position written every few seconds back
  // into the player. Recomputing only when the stream changes freezes it.
  const resumeAt = useMemo(
    () => (hydrated && canSaveHistory ? resumePosition(readHistoryEntry(id, kind, streamId)) : 0),
    [canSaveHistory, hydrated, id, kind, streamId]
  );

  const goToEpisode = useCallback(
    (ep) => {
      if (!ep) return;
      showControls();
      const label = `${seriesName} · T${ep.season} E${ep.episode_num} · ${ep.title || ''}`;
      const params = new URLSearchParams({
        type: 'series',
        streamId: String(ep.id),
        ext: ep.container_extension || 'mp4',
        title: label,
        seriesId: String(seriesId),
      });
      if (seriesPoster) params.set('poster', seriesPoster);
      router.replace(`/app/playlist/${id}/player?${params.toString()}`);
    },
    [id, router, seriesId, seriesName, seriesPoster, showControls]
  );

  const handleEnded = useCallback(() => {
    if (nextEpisode) goToEpisode(nextEpisode);
  }, [goToEpisode, nextEpisode]);

  // Only whether a playlist exists matters here; depending on the object would
  // re-arm these on every library write.
  const playlistReady = !!playlist;

  const handleProgress = useCallback(
    (position, duration, { completed } = {}) => {
      if (!playlistReady || !canSaveHistory) return;
      saveProgress(id, kind, streamId, position, duration);
      if (completed) markCompleted(id, kind, streamId);
    },
    [canSaveHistory, id, kind, playlistReady, streamId]
  );

  // Records the item as watched. Runs again once the series metadata lands so
  // the entry gets the real series name / season / episode instead of the
  // label carried in the URL.
  useEffect(() => {
    if (!hydrated || !playlistReady || !streamId || !canSaveHistory) return;
    recordPlayback(id, {
      kind,
      id: streamId,
      name: kind === 'series' ? seriesName || title : title,
      image: kind === 'series' ? seriesPoster : poster,
      ext,
      seriesId: kind === 'series' ? seriesId : undefined,
      season: currentEpisode?.season,
      episode: currentEpisode?.episode_num,
      episodeTitle: currentEpisode?.title,
    });
  }, [
    canSaveHistory,
    hydrated,
    playlistReady,
    id,
    kind,
    streamId,
    ext,
    title,
    poster,
    seriesId,
    seriesName,
    seriesPoster,
    currentEpisode,
  ]);

  // Shown for a few seconds whenever playback picks up where it stopped.
  useEffect(() => {
    if (!resumeAt) return undefined;
    const timer = setTimeout(() => setNoticeDoneFor(streamId), RESUME_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [resumeAt, streamId]);

  const resumeNotice =
    resumeAt && noticeDoneFor !== streamId ? `Retomando de ${formatClock(resumeAt)}` : '';

  useEffect(() => {
    armIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [streamId, armIdleTimer]);

  // Waiting for the stored library avoids both a "playlist not found" flash
  // and mounting the player before the resume point is known.
  if (!hydrated) {
    return (
      <main className={styles.page}>
        <div className={styles.stateWrap}>
          <LoadingState label="Carregando..." />
        </div>
      </main>
    );
  }

  if (playlist === null) {
    return (
      <main className={styles.page}>
        <div className={styles.stateWrap}>
          <ErrorState message="Playlist nao encontrada." onRetry={() => router.push('/app')} />
        </div>
      </main>
    );
  }

  if (!type || !streamId) {
    return (
      <main className={styles.page}>
        <div className={styles.stateWrap}>
          <ErrorState
            message="Conteudo invalido para reproducao."
            onRetry={() => router.push(`/app/playlist/${id}`)}
          />
        </div>
      </main>
    );
  }

  if (slotError) {
    return (
      <main className={styles.page}>
        <div className={styles.stateWrap}>
          <UpgradeNotice
            title={slotError.code === 'SCREEN_LIMIT' ? 'Limite de telas atingido' : 'Nao foi possivel iniciar'}
            message={slotError.message}
            showUpgrade={slotError.code === 'SCREEN_LIMIT'}
            onRetry={retrySlot}
            onBack={() => goBack(router, `/app/playlist/${id}`)}
          />
        </div>
      </main>
    );
  }

  if (!token) {
    return (
      <main className={styles.page}>
        <div className={styles.stateWrap}>
          <LoadingState label="Liberando a reproducao..." />
        </div>
      </main>
    );
  }

  const src = playableUrl(playlist, kind, streamId, ext, token);

  return (
    <main className={styles.page}>
      <div
        className={styles.stage}
        onMouseMove={showControls}
        onTouchStart={showControls}
        onClick={showControls}
      >
        <VideoPlayer
          key={src}
          src={src}
          isHls={ext === 'm3u8'}
          ext={ext}
          onEnded={handleEnded}
          onProgress={handleProgress}
          startPosition={resumeAt}
          tokenRef={tokenRef}
          controls={controlsVisible}
        />

        <div className={`${styles.overlayTop} ${controlsVisible ? '' : styles.hidden}`}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => goBack(router, `/app/playlist/${id}`)}
            aria-label="Voltar"
          >
            <BackIcon />
          </button>
          <div className={styles.titleBlock}>
            <p className={styles.title}>{title}</p>
          </div>
        </div>

        {resumeNotice && <p className={styles.resumeNotice}>{resumeNotice}</p>}

        {prevEpisode && (
          <button
            type="button"
            className={`${styles.navBtn} ${styles.navPrev} ${controlsVisible ? '' : styles.hidden}`}
            onClick={() => goToEpisode(prevEpisode)}
            aria-label="Episodio anterior"
          >
            <ChevronIcon direction="left" />
          </button>
        )}
        {nextEpisode && (
          <button
            type="button"
            className={`${styles.navBtn} ${styles.navNext} ${controlsVisible ? '' : styles.hidden}`}
            onClick={() => goToEpisode(nextEpisode)}
            aria-label="Proximo episodio"
          >
            <ChevronIcon direction="right" />
          </button>
        )}
      </div>
    </main>
  );
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ direction }) {
  const d = direction === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6';
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d={d} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
