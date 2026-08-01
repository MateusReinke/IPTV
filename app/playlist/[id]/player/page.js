'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { usePlaylist } from '@/lib/playlists';
import { playableUrl, xtreamRequest } from '@/lib/xtream';
import VideoPlayer from '@/components/VideoPlayer';
import { ErrorState, LoadingState } from '@/components/StateMessage';
import styles from './page.module.css';

const IDLE_HIDE_DELAY = 3500;

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

  const type = searchParams.get('type');
  const streamId = searchParams.get('streamId');
  const ext = searchParams.get('ext') || (type === 'live' ? 'm3u8' : 'mp4');
  const title = searchParams.get('title') || 'Reproduzindo';
  const seriesId = searchParams.get('seriesId');

  const [controlsVisible, setControlsVisible] = useState(true);
  const idleTimerRef = useRef(null);

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
  const prevEpisode = currentIndex > 0 ? flatEpisodes[currentIndex - 1] : null;
  const nextEpisode =
    currentIndex >= 0 && currentIndex < flatEpisodes.length - 1
      ? flatEpisodes[currentIndex + 1]
      : null;
  const seriesName = seriesData?.info?.name || '';

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
      router.replace(`/playlist/${id}/player?${params.toString()}`);
    },
    [id, router, seriesId, seriesName, showControls]
  );

  const handleEnded = useCallback(() => {
    if (nextEpisode) goToEpisode(nextEpisode);
  }, [goToEpisode, nextEpisode]);

  useEffect(() => {
    armIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [streamId, armIdleTimer]);

  if (playlist === null) {
    return (
      <main className={styles.page}>
        <div className={styles.stateWrap}>
          <ErrorState message="Playlist nao encontrada." onRetry={() => router.push('/')} />
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
            onRetry={() => router.push(`/playlist/${id}`)}
          />
        </div>
      </main>
    );
  }

  const kind = type === 'movie' ? 'movie' : type === 'series' ? 'series' : 'live';
  const src = playableUrl(playlist, kind, streamId, ext);

  return (
    <main className={styles.page}>
      <div
        className={styles.stage}
        onMouseMove={showControls}
        onTouchStart={showControls}
        onClick={showControls}
      >
        <VideoPlayer key={src} src={src} isHls={ext === 'm3u8'} ext={ext} onEnded={handleEnded} />

        <div className={`${styles.overlayTop} ${controlsVisible ? '' : styles.hidden}`}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => router.back()}
            aria-label="Voltar"
          >
            <BackIcon />
          </button>
          <div className={styles.titleBlock}>
            <p className={styles.title}>{title}</p>
          </div>
        </div>

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
