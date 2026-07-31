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
    <div className={styles.wrap}>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
