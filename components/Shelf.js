'use client';

import styles from './Shelf.module.css';

// Horizontally scrolling row of cards (used for "Continuar assistindo").
export default function Shelf({ title, hint, action, itemWidth = 200, className = '', children }) {
  return (
    <section className={`${styles.shelf} ${className}`.trim()}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {hint && <span className={styles.hint}>{hint}</span>}
        {action && <span className={styles.action}>{action}</span>}
      </div>
      <div className={styles.row} style={{ '--shelf-item': `${itemWidth}px` }}>
        {children}
      </div>
    </section>
  );
}
