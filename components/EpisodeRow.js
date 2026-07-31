'use client';

import styles from './EpisodeRow.module.css';

export default function EpisodeRow({ number, title, plot, onClick }) {
  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <span className={styles.num}>{number}</span>
      <span className={styles.info}>
        <span className={styles.title}>{title}</span>
        {plot && <span className={styles.plot}>{plot}</span>}
      </span>
      <span className={styles.play} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </button>
  );
}
