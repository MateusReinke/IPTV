'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { APP_NAME } from '@/lib/pricing';
import LogoMark from './LogoMark';
import buttonStyles from './Button.module.css';
import styles from './AuthCard.module.css';

// Shared shell for entrar / criar-conta / redefinir-senha.
export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Link href="/" className={styles.brand}>
          <LogoMark className={styles.mark} />
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

// Self-contained like SetupWarning.js: checks /api/health and simply renders
// nothing when the server has no Google OAuth client configured, instead of
// showing a button that would just redirect into an error.
export function GoogleButton({ next = '/app' }) {
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/health', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (active) setConfigured(!!data?.checks?.googleAuth?.configured);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!configured) return null;

  return (
    <>
      <a
        className={`${buttonStyles.btn} ${buttonStyles.secondary} ${buttonStyles.fullWidth}`}
        href={`/api/auth/google?next=${encodeURIComponent(next)}`}
      >
        <GoogleIcon /> Continuar com Google
      </a>
      <div className={styles.divider}>
        <span>ou</span>
      </div>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.71A5.4 5.4 0 0 1 3.67 9c0-.6.1-1.18.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96L3.95 7.3C4.66 5.16 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}

export { styles as authStyles };
