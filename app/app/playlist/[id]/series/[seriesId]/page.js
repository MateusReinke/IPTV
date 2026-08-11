'use client';

import { Suspense, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { usePlaylist } from '@/lib/playlists';
import { formatClock, isCompleted, progressRatio, useSeriesProgress } from '@/lib/history';
import { xtreamRequest } from '@/lib/xtream';
import Button from '@/components/Button';
import EpisodeRow from '@/components/EpisodeRow';
import { LoadingState, ErrorState, EmptyState } from '@/components/StateMessage';
import styles from './page.module.css';

export default function SeriesDetailPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <LoadingState label="Carregando serie..." />
        </main>
      }
    >
      <SeriesDetailContent />
    </Suspense>
  );
}

function SeriesDetailContent() {
  const { id, seriesId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const fallbackTitle = searchParams.get('title') || '';

  const playlist = usePlaylist(id);
  const [season, setSeason] = useState(null);
  const [posterBroken, setPosterBroken] = useState(false);
  const seriesProgress = useSeriesProgress(id, seriesId);

  const {
    data,
    isLoading,
    error,
    mutate: reload,
  } = useSWR(playlist ? ['xtream-series-info', playlist.id, seriesId] : null, () =>
    xtreamRequest(playlist, 'get_series_info', { series_id: seriesId })
  );

  if (playlist === null) {
    return (
      <main className={styles.page}>
        <ErrorState message="Playlist nao encontrada." onRetry={() => router.push('/app')} />
      </main>
    );
  }

  if (isLoading || (!data && !error)) {
    return (
      <main className={styles.page}>
        <TopBar title={fallbackTitle} onBack={() => router.push(`/app/playlist/${id}`)} />
        <LoadingState label="Carregando serie..." />
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.page}>
        <TopBar title={fallbackTitle} onBack={() => router.push(`/app/playlist/${id}`)} />
        <ErrorState message={error.message} onRetry={() => reload()} />
      </main>
    );
  }

  const info = data?.info || {};
  const seasonKeys = Object.keys(data?.episodes || {}).sort((a, b) => Number(a) - Number(b));
  const currentSeason = season && seasonKeys.includes(season) ? season : seasonKeys[0] || null;
  const episodes = (data?.episodes || {})[currentSeason] || [];
  const name = info.name || fallbackTitle || 'Serie';
  const poster = info.cover || info.cover_big;
  const genre = info.genre;
  const rating = info.rating && Number(info.rating) > 0 ? Number(info.rating).toFixed(1) : null;
  const releaseDate = info.releaseDate || info.release_date;

  const lastWatched = seriesProgress?.last;
  const watchedEpisodes = seriesProgress?.watched;

  function openEpisode(ep, seasonNumber) {
    const label = `${name} · T${seasonNumber} E${ep.episode_num} · ${ep.title || ''}`;
    const params = new URLSearchParams({
      type: 'series',
      streamId: String(ep.id),
      ext: ep.container_extension || 'mp4',
      title: label,
      seriesId: String(seriesId),
    });
    if (poster) params.set('poster', poster);
    router.push(`/app/playlist/${id}/player?${params.toString()}`);
  }

  // The "continue" button needs the raw episode (for its container extension),
  // which only the freshly loaded series payload has.
  function findEpisode(episodeId) {
    for (const [seasonNumber, list] of Object.entries(data?.episodes || {})) {
      const found = (list || []).find((ep) => String(ep.id) === String(episodeId));
      if (found) return { episode: found, seasonNumber };
    }
    return null;
  }

  function resumeLastWatched() {
    const match = findEpisode(lastWatched.id);
    if (match) openEpisode(match.episode, match.seasonNumber);
  }

  return (
    <main className={styles.page}>
      <TopBar title={name} onBack={() => router.push(`/app/playlist/${id}`)} />

      <div className={styles.hero}>
        <span className={styles.poster}>
          {poster && !posterBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.posterImg}
              src={poster}
              alt=""
              onError={() => setPosterBroken(true)}
            />
          ) : (
            name.trim().charAt(0).toUpperCase() || '?'
          )}
        </span>
        <div className={styles.meta}>
          <h1 className={styles.name}>{name}</h1>
          <div className={styles.tags}>
            {rating && <span className={styles.tag}>★ {rating}</span>}
            {releaseDate && <span className={styles.tag}>{releaseDate}</span>}
            {genre && <span className={styles.tag}>{genre}</span>}
          </div>
          {lastWatched && (
            <div className={styles.resume}>
              <Button variant="primary" onClick={resumeLastWatched}>
                <PlayIcon />
                {isCompleted(lastWatched)
                  ? `Rever T${lastWatched.season} E${lastWatched.episode}`
                  : `Continuar T${lastWatched.season} E${lastWatched.episode}`}
              </Button>
              {!isCompleted(lastWatched) && lastWatched.position > 0 && (
                <span className={styles.resumeHint}>
                  parou em {formatClock(lastWatched.position)}
                </span>
              )}
            </div>
          )}
          {info.plot && <p className={styles.plot}>{info.plot}</p>}
          {(info.cast || info.director) && (
            <p className={styles.crew}>
              {info.director && <>Direcao: {info.director}. </>}
              {info.cast && <>Elenco: {info.cast}</>}
            </p>
          )}
        </div>
      </div>

      <div className={styles.section}>
        {seasonKeys.length > 1 && (
          <div className={styles.seasonTabs}>
            {seasonKeys.map((key) => (
              <button
                key={key}
                type="button"
                className={`${styles.seasonTab} ${key === currentSeason ? styles.seasonTabActive : ''}`}
                onClick={() => setSeason(key)}
              >
                Temporada {key}
              </button>
            ))}
          </div>
        )}

        {episodes.length === 0 ? (
          <EmptyState message="Nenhum episodio encontrado nesta temporada." />
        ) : (
          <div className={styles.episodes}>
            {episodes.map((ep) => {
              const watched = watchedEpisodes?.get(String(ep.id));
              return (
                <EpisodeRow
                  key={ep.id}
                  number={ep.episode_num}
                  title={ep.title || `Episodio ${ep.episode_num}`}
                  plot={ep.info?.plot}
                  onClick={() => openEpisode(ep, currentSeason)}
                  watched={isCompleted(watched)}
                  progress={progressRatio(watched)}
                  progressLabel={
                    watched?.position ? `${formatClock(watched.position)} assistidos` : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function TopBar({ title, onBack }) {
  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.back} onClick={onBack} aria-label="Voltar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M15 5l-7 7 7 7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <p className={styles.headTitle}>{title}</p>
    </header>
  );
}
