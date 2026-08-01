'use client';

import { useState } from 'react';
import Button from './Button';
import styles from './Hero.module.css';

export default function Hero({ kind, item, onPlay, onMoreInfo }) {
  const [broken, setBroken] = useState(false);
  const title = item.name || '';
  const poster = item.stream_icon || item.cover;
  const showImage = poster && !broken;
  const rating = item.rating && Number(item.rating) > 0 ? Number(item.rating).toFixed(1) : null;
  const genre = item.genre;
  const releaseDate = item.releaseDate || item.release_date;
  const plot = item.plot;
  const kicker = kind === 'series' ? 'Serie em destaque' : 'Filme em destaque';

  return (
    <section className={styles.hero}>
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
          <Button variant="primary" onClick={onPlay}>
            <PlayIcon /> Assistir
          </Button>
          {onMoreInfo && (
            <Button variant="secondary" onClick={onMoreInfo}>
              Mais informacoes
            </Button>
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
