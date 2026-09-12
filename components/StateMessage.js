import Spinner from './Spinner';
import Button from './Button';
import styles from './StateMessage.module.css';

export function LoadingState({ label = 'Carregando...' }) {
  return (
    <div className={styles.wrap}>
      <Spinner size={24} />
      <p className={styles.message}>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className={styles.wrap}>
      <p className={`${styles.message} ${styles.danger}`}>{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ message }) {
  return (
    <div className={`${styles.wrap} ${styles.empty}`}>
      <span className={styles.emptyIcon} aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 12h4l2 3h4l2-3h4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 12 5.5 5a1 1 0 0 1 1-.8h11a1 1 0 0 1 1 .8L20 12v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
