'use client';

import styles from './EpisodeRow.module.css';

export default function EpisodeRow({
  number,
  title,
  plot,
  onClick,
  progress = 0,
  watched = false,
  progressLabel,
}) {
  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <span className={`${styles.num} ${watched ? styles.numWatched : ''}`}>
        {watched ? <CheckIcon /> : number}
      </span>
      <span className={styles.info}>
        <span className={styles.title}>{title}</span>
        {plot && <span className={styles.plot}>{plot}</span>}
        {progress > 0 && !watched && (
          <span className={styles.progressRow}>
            <span className={styles.progressTrack} aria-hidden="true">
              <span
                className={styles.progressBar}
                style={{ width: `${Math.min(100, Math.max(3, progress * 100))}%` }}
              />
            </span>
            {progressLabel && <span className={styles.progressLabel}>{progressLabel}</span>}
          </span>
        )}
      </span>
      <span className={styles.play} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </button>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-label="Assistido">
      <path
        d="M5 12.5 10 17.5 19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
