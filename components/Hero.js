'use client';

import { useState } from 'react';
import Button from './Button';
import HeartIcon from './HeartIcon';
import styles from './Hero.module.css';

export default function Hero({ kind, item, onOpen, favorited, onToggleFavorite }) {
  const [broken, setBroken] = useState(false);
  const title = item.name || '';
  const poster = item.stream_icon || item.cover;
  const showImage = poster && !broken;
  const rating = item.rating && Number(item.rating) > 0 ? Number(item.rating).toFixed(1) : null;
  const genre = item.genre;
  const releaseDate = item.releaseDate || item.release_date;
  const plot = item.plot;
  const isSeries = kind === 'series';
  const kicker = isSeries ? 'Serie em destaque' : 'Filme em destaque';
  const actionLabel = isSeries ? 'Ver episodios' : 'Assistir';

  return (
    <section
      className={styles.hero}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.();
        }
      }}
    >
      <span className={styles.poster}>
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.posterImg} src={poster} alt="" onError={() => setBroken(true)} />
        ) : (
          <span className={styles.fallback} aria-hidden="true">
            {title.trim().charAt(0).toUpperCase() || '?'}
          </span>
        )}
      </span>
      <div className={styles.content}>
        <span className={styles.kicker}>{kicker}</span>
        <h2 className={styles.title}>{title}</h2>
        {(rating || releaseDate || genre) && (
          <div className={styles.meta}>
            {rating && <span className={styles.tag}>★ {rating}</span>}
            {releaseDate && <span className={styles.tag}>{releaseDate}</span>}
            {genre && <span className={styles.tag}>{genre}</span>}
          </div>
        )}
        {plot && <p className={styles.plot}>{plot}</p>}
        <div className={styles.actions}>
          <Button
            variant="primary"
            onClick={(e) => {
              e.stopPropagation();
              onOpen?.();
            }}
          >
            {isSeries ? <ListIcon /> : <PlayIcon />} {actionLabel}
          </Button>
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
              <HeartIcon filled={!!favorited} size={18} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
