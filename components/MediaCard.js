'use client';

import { useState } from 'react';
import styles from './MediaCard.module.css';

export default function MediaCard({ title, subtitle, image, aspect = 'landscape', onClick }) {
  const [broken, setBroken] = useState(false);
  const showImage = image && !broken;

  return (
    <button type="button" className={styles.card} onClick={onClick} title={title}>
      <span className={`${styles.thumb} ${styles[aspect]}`}>
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.img}
            src={image}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className={styles.fallback} aria-hidden="true">
            {title.trim().charAt(0).toUpperCase() || '?'}
          </span>
        )}
        <span className={styles.playBadge} aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
      <span className={styles.body}>
        <span className={styles.name}>{title}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
    </button>
  );
}
