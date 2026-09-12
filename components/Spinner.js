import styles from './Spinner.module.css';

export default function Spinner({ size = 18, label = 'Carregando' }) {
  return (
    <span
      className={styles.spinner}
      style={{ '--size': `${size}px` }}
      role="status"
      aria-label={label}
    />
  );
}
