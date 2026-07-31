import styles from './MediaGrid.module.css';

export default function MediaGrid({ children, columnWidth }) {
  return (
    <div className={styles.grid} style={columnWidth ? { '--col': `${columnWidth}px` } : undefined}>
      {children}
    </div>
  );
}
