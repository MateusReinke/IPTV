'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthCard, { Field, FormError, authStyles as styles } from '@/components/AuthCard';
import Button from '@/components/Button';

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthCard title="Entrar" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only in-app paths, so a crafted ?next= cannot bounce someone off-site.
  const rawNext = searchParams.get('next') || '/app';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/app';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Nao foi possivel entrar');
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Entrar"
      subtitle="Acesse sua conta para assistir."
      footer={
        <>
          Ainda nao tem conta?{' '}
          <Link className={styles.link} href="/criar-conta">
            Comece o teste gratis
          </Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field
          id="email"
          label="E-mail"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
        />
        <Field
          id="password"
          label="Senha"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
        />
        <FormError>{error}</FormError>
        <Button type="submit" variant="primary" fullWidth loading={busy}>
          Entrar
        </Button>
      </form>
    </AuthCard>
  );
}
