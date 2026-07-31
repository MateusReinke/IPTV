'use client';

import styles from './PlaylistCard.module.css';

function hostOf(server) {
  try {
    return new URL(server).host;
  } catch {
    return server;
  }
}

export default function PlaylistCard({ playlist, onOpen, onRemove }) {
  const initial = playlist.title.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className={styles.card} role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className={styles.avatar} aria-hidden="true">
        {initial}
      </span>
      <span className={styles.info}>
        <span className={styles.title}>{playlist.title}</span>
        <span className={styles.meta}>
          {hostOf(playlist.server)} · {playlist.username}
        </span>
      </span>
      <button
        type="button"
        className={styles.remove}
        aria-label={`Remover ${playlist.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H7.7a2 2 0 0 1-2-1.9L5 7h14Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
