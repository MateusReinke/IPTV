'use client';

import { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { usePlaylist } from '@/lib/playlists';
import { playableUrl } from '@/lib/xtream';
import VideoPlayer from '@/components/VideoPlayer';
import { ErrorState, LoadingState } from '@/components/StateMessage';
import styles from './page.module.css';

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
      <header className={styles.topbar}>
        <button type="button" className={styles.back} onClick={() => router.back()} aria-label="Voltar">
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
        <p className={styles.title}>{title}</p>
      </header>
      <div className={styles.playerWrap}>
        <VideoPlayer key={src} src={src} isHls={ext === 'm3u8'} />
      </div>
    </main>
  );
}
