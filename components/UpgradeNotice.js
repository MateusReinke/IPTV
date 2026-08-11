'use client';

import Link from 'next/link';
import Button from './Button';
import styles from './UpgradeNotice.module.css';

// Shown wherever the plan stops something: the screen limit, watch history,
// cloud sync. Always says what is blocked and offers the way out.
export default function UpgradeNotice({
  title = 'Recurso do Premium',
  message,
  showUpgrade = true,
  onRetry,
  onBack,
  compact = false,
}) {
  return (
    <div className={`${styles.card} ${compact ? styles.compact : ''}`}>
      <span className={styles.icon} aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M7 10V7a5 5 0 0 1 10 0v3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {message && <p className={styles.message}>{message}</p>}
        <div className={styles.actions}>
          {showUpgrade && (
            <Link href="/app/conta">
              <Button variant="primary">Ver planos</Button>
            </Link>
          )}
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Tentar novamente
            </Button>
          )}
          {onBack && (
            <Button variant="ghost" onClick={onBack}>
              Voltar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
