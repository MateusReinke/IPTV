'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthCard, { Field, FormError, authStyles as styles } from '@/components/AuthCard';
import Button from '@/components/Button';
import { TRIAL_DAYS } from '@/lib/entitlements';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Nao foi possivel criar a conta');
      router.push('/app');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Criar conta"
      subtitle={`${TRIAL_DAYS} dias com tudo liberado, incluindo multitela. Sem cartao de credito.`}
      footer={
        <>
          Ja tem conta?{' '}
          <Link className={styles.link} href="/entrar">
            Entrar
          </Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field id="name" label="Nome" value={name} onChange={setName} autoComplete="name" />
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
          autoComplete="new-password"
          required
          minLength={8}
        />
        <p className={styles.hint}>Use pelo menos 8 caracteres.</p>
        <FormError>{error}</FormError>
        <Button type="submit" variant="primary" fullWidth loading={busy}>
          Comecar teste gratuito
        </Button>
      </form>
    </AuthCard>
  );
}
