'use client';

import { useState } from 'react';
import { isValidServerUrl } from '@/lib/xtream';
import Button from './Button';
import styles from './PlaylistForm.module.css';

const EMPTY = { title: '', server: '', username: '', password: '' };

export default function PlaylistForm({ onSubmit, onCancel, submitLabel = 'Adicionar' }) {
  const [values, setValues] = useState(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isValid =
    values.title.trim().length > 0 &&
    values.username.trim().length > 0 &&
    values.password.trim().length > 0 &&
    isValidServerUrl(values.server);

  function update(field) {
    return (e) => setValues((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        title: values.title.trim(),
        server: values.server.trim(),
        username: values.username.trim(),
        password: values.password,
      });
      setValues(EMPTY);
    } catch (err) {
      setError(err?.message || 'Nao foi possivel adicionar a playlist');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="pl-title">
          Nome da playlist*
        </label>
        <div className={styles.inputWrap}>
          <input
            id="pl-title"
            className={styles.input}
            type="text"
            placeholder="Minha playlist"
            autoComplete="off"
            value={values.title}
            onChange={update('title')}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="pl-server">
          URL do servidor*
        </label>
        <div className={styles.inputWrap}>
          <input
            id="pl-server"
            className={styles.input}
            type="text"
            placeholder="http://exemplo.com:8080"
            autoComplete="off"
            inputMode="url"
            value={values.server}
            onChange={update('server')}
          />
        </div>
        <p className={styles.hint}>
          Deve ser uma URL valida com protocolo (ex: http://exemplo.com ou
          https://exemplo.com:4324)
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="pl-username">
          Usuario*
        </label>
        <div className={styles.inputWrap}>
          <input
            id="pl-username"
            className={styles.input}
            type="text"
            placeholder="usuario"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={values.username}
            onChange={update('username')}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="pl-password">
          Senha*
        </label>
        <div className={styles.inputWrap}>
          <input
            id="pl-password"
            className={`${styles.input} ${styles.hasToggle}`}
            type={showPassword ? 'text' : 'password'}
            placeholder="senha"
            autoComplete="off"
            value={values.password}
            onChange={update('password')}
          />
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={!isValid} loading={submitting}>
          {submitting ? 'Verificando...' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.3 5.4A11 11 0 0 1 12 5c7 0 11 7 11 7a13.6 13.6 0 0 1-3.4 4.1M6.2 6.9C3.6 8.6 1 12 1 12s4 7 11 7c1.4 0 2.7-.24 3.9-.66"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
