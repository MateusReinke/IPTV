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
  progress = 0,
  onRemove,
  removeLabel = 'Remover',
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
        {onRemove && (
          <button
            type="button"
            className={styles.removeBtn}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={removeLabel}
            title={removeLabel}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        {progress > 0 && (
          <span className={styles.progressTrack} aria-hidden="true">
            <span
              className={styles.progressBar}
              style={{ width: `${Math.min(100, Math.max(3, progress * 100))}%` }}
            />
          </span>
        )}
      </span>
      <span className={styles.body}>
        <span className={styles.name}>{title}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
    </div>
  );
}
