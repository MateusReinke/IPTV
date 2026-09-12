'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthCard, { Field, FormError, authStyles as styles } from '@/components/AuthCard';
import Button from '@/components/Button';

export default function ResetPage() {
  return (
    <Suspense fallback={<AuthCard title="Redefinir senha" />}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Nao foi possivel redefinir a senha');
      setDone(true);
      setTimeout(() => router.push('/entrar'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Redefinir senha" subtitle="Este link nao e valido.">
        <p className={styles.hint}>
          Peca um novo link de redefinicao ao suporte e abra-o por completo.
        </p>
        <Link className={styles.link} href="/entrar">
          Voltar para o login
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Redefinir senha" subtitle="Escolha uma nova senha para sua conta.">
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field
          id="password"
          label="Nova senha"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
          minLength={8}
        />
        <FormError>{error}</FormError>
        {done && <p className={styles.success}>Senha alterada. Redirecionando...</p>}
        <Button type="submit" variant="primary" fullWidth loading={busy} disabled={done}>
          Salvar nova senha
        </Button>
      </form>
    </AuthCard>
  );
}
