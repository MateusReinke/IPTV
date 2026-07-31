import styles from './StatusPill.module.css';

export default function StatusPill({ tone = 'active', children }) {
  return (
    <span className={`${styles.pill} ${styles[tone]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}
