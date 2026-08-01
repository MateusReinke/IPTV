'use client';

import { useState } from 'react';
import HeartIcon from './HeartIcon';
import styles from './MediaCard.module.css';

export default function MediaCard({
  title,
  subtitle,
  image,
  aspect = 'landscape',
  onClick,
  favorited,
  onToggleFavorite,
}) {
  const [broken, setBroken] = useState(false);
  const showImage = image && !broken;

  return (
    <div
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      title={title}
    >
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
        {onToggleFavorite && (
          <button
            type="button"
            className={`${styles.favBtn} ${favorited ? styles.favBtnActive : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            aria-label={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            aria-pressed={!!favorited}
          >
            <HeartIcon filled={!!favorited} />
          </button>
        )}
      </span>
      <span className={styles.body}>
        <span className={styles.name}>{title}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
    </div>
  );
}
