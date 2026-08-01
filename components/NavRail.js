'use client';

import HeartIcon from './HeartIcon';
import styles from './NavRail.module.css';

const ICONS = {
  live: LiveIcon,
  movie: MovieIcon,
  series: SeriesIcon,
};

export default function NavRail({ tabs, active, onChange, onHome }) {
  return (
    <nav className={styles.rail} aria-label="Navegacao principal">
      <button type="button" className={styles.home} onClick={onHome} aria-label="Suas playlists">
        <HomeIcon />
      </button>
      <div className={styles.nav} role="tablist">
        {tabs.map((tab) => {
          const Icon = ICONS[tab.value];
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={tab.value === active}
              className={`${styles.item} ${tab.value === active ? styles.itemActive : ''}`}
              onClick={() => onChange(tab.value)}
            >
              {Icon && <Icon />}
              <span className={styles.label}>{tab.shortLabel || tab.label}</span>
            </button>
          );
        })}
        <div className={styles.divider} />
        <button
          type="button"
          role="tab"
          aria-selected={active === 'favorites'}
          className={`${styles.item} ${active === 'favorites' ? styles.itemActive : ''}`}
          onClick={() => onChange('favorites')}
        >
          <HeartIcon filled={active === 'favorites'} size={19} />
          <span className={styles.label}>Favoritos</span>
        </button>
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 21h8M7 2 12 5l5-3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LiveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M8 21.5h8M7 2.5 12 6l5-3.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MovieIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.2 4.6 4a1 1 0 0 1 1.2-.7l12.7 3.1a1 1 0 0 1 .7 1.2l-.5 2M20.5 8.2H3.5v11.3a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1V8.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 8.2 9.6 3.7M14 8.2l1.4-4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SeriesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 21 8 12 13 3 8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M3 12.5 12 17.5 21 12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 16.5 12 21.5 21 16.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
