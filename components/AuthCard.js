'use client';

import Link from 'next/link';
import { APP_NAME } from '@/lib/pricing';
import styles from './AuthCard.module.css';

// Shared shell for entrar / criar-conta / redefinir-senha.
export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Link href="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          {APP_NAME}
        </Link>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </div>
      {footer && <p className={styles.footer}>{footer}</p>}
    </main>
  );
}

export function Field({ id, label, type = 'text', value, onChange, ...rest }) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return <p className={styles.error}>{children}</p>;
}

export { styles as authStyles };
