import styles from './Skeleton.module.css';

export function SkeletonGrid({ count = 12, aspect = 'landscape', columnWidth }) {
  return (
    <div className={styles.grid} style={columnWidth ? { '--col': `${columnWidth}px` } : undefined}>
      {Array.from({ length: count }).map((_, i) => (
        <div className={styles.card} key={i}>
          <div className={`${styles.thumb} ${aspect === 'portrait' ? styles.portrait : ''}`} />
          <div className={styles.line} />
          <div className={`${styles.line} ${styles.short}`} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 8 }) {
  return (
    <div className={styles.rows}>
      {Array.from({ length: count }).map((_, i) => (
        <div className={styles.row} key={i} />
      ))}
    </div>
  );
}

const CHIP_WIDTHS = [92, 130, 108, 150, 96, 120, 104];

export function SkeletonChips({ count = 7 }) {
  return (
    <div className={styles.chips}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          className={styles.chip}
          key={i}
          style={{ '--w': `${CHIP_WIDTHS[i % CHIP_WIDTHS.length]}px` }}
        />
      ))}
    </div>
  );
}
