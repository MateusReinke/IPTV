'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@/components/SessionProvider';
import SyncPanel from '@/components/SyncPanel';
import Button from '@/components/Button';
import { PRICING, formatBRL, monthlyEquivalent } from '@/lib/pricing';
import { TRIAL_DAYS } from '@/lib/entitlements';
import styles from './page.module.css';

export default function AccountPage() {
  return (
    <Suspense fallback={<main className={styles.page} />}>
      <AccountContent />
    </Suspense>
  );
}

function AccountContent() {
  const { user, entitlements, refresh } = useSession();
  const checkout = useSearchParams().get('checkout');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function startCheckout(planId) {
    setBusy(planId);
    setError('');
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Nao foi possivel iniciar o pagamento');
      window.location.assign(data.url);
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  }

  async function openPortal() {
    setBusy('portal');
    setError('');
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Nao foi possivel abrir o portal');
      window.location.assign(data.url);
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Sua conta</h1>
          <p className={styles.email}>{user?.email}</p>
        </header>

        {checkout === 'sucesso' && (
          <p className={styles.success}>
            Pagamento recebido. Se o plano ainda aparecer como antigo,{' '}
            <button type="button" className={styles.inlineBtn} onClick={() => refresh()}>
              atualize o status
            </button>
            .
          </p>
        )}
        {checkout === 'cancelado' && (
          <p className={styles.notice}>Pagamento cancelado. Nenhuma cobranca foi feita.</p>
        )}

        <PlanCard entitlements={entitlements} onPortal={openPortal} busy={busy} />

        {entitlements?.plan !== 'premium' && (
          <section className={styles.plans}>
            <h2 className={styles.sectionTitle}>Assinar o Premium</h2>
            <p className={styles.sectionLead}>
              Ate 9 telas ao mesmo tempo, audio selecionavel, historico, sincronizacao e
              indicacao da IA sem limite de uso.
            </p>
            <div className={styles.planGrid}>
              {Object.values(PRICING).map((plan) => (
                <article
                  key={plan.id}
                  className={`${styles.plan} ${plan.id === 'yearly' ? styles.planFeatured : ''}`}
                >
                  <h3 className={styles.planName}>{plan.label}</h3>
                  <p className={styles.planPrice}>
                    {formatBRL(plan.amount)}
                    <span className={styles.planPeriod}>/{plan.period}</span>
                  </p>
                  <p className={styles.planNote}>
                    {plan.period === 'ano'
                      ? `${formatBRL(monthlyEquivalent(plan))} por mes`
                      : plan.note}
                  </p>
                  <Button
                    variant={plan.id === 'yearly' ? 'primary' : 'secondary'}
                    fullWidth
                    loading={busy === plan.id}
                    onClick={() => startCheckout(plan.id)}
                  >
                    Assinar {plan.label.toLowerCase()}
                  </Button>
                </article>
              ))}
            </div>
            {error && <p className={styles.error}>{error}</p>}
          </section>
        )}

        <SyncPanel />
      </div>
    </main>
  );
}

function PlanCard({ entitlements, onPortal, busy }) {
  if (!entitlements) return null;

  const rows = [];
  if (entitlements.plan === 'trial') {
    rows.push([
      'Teste gratuito',
      entitlements.daysLeft === 0
        ? 'termina hoje'
        : `${entitlements.daysLeft} dia${entitlements.daysLeft === 1 ? '' : 's'} restante${entitlements.daysLeft === 1 ? '' : 's'}`,
    ]);
  }
  if (entitlements.expiresAt) {
    rows.push([
      entitlements.plan === 'premium'
        ? entitlements.cancelAtPeriodEnd
          ? 'Acesso ate'
          : 'Proxima renovacao'
        : 'Valido ate',
      new Date(entitlements.expiresAt).toLocaleDateString('pt-BR'),
    ]);
  }
  rows.push(['Telas simultaneas', String(entitlements.features.screens)]);
  rows.push(['Historico e sincronizacao', entitlements.features.history ? 'Incluidos' : 'Bloqueados']);
  rows.push([
    'Indicacao da IA',
    entitlements.features.aiPickCooldownDays > 0
      ? `1 a cada ${entitlements.features.aiPickCooldownDays} dias`
      : 'Sem limite',
  ]);

  return (
    <section className={styles.planCard}>
      <div className={styles.planCardHead}>
        <div>
          <span className={styles.planCardLabel}>Plano atual</span>
          <h2 className={styles.planCardName}>{entitlements.planLabel}</h2>
        </div>
        {entitlements.plan === 'premium' && (
          <Button variant="ghost" onClick={onPortal} loading={busy === 'portal'}>
            Gerenciar assinatura
          </Button>
        )}
      </div>

      <dl className={styles.rows}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.row}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {entitlements.plan === 'free' && (
        <p className={styles.planCardNote}>
          {entitlements.trialUsed
            ? 'Seu teste terminou. Voce continua assistindo com uma tela por vez.'
            : `Ative seu teste de ${TRIAL_DAYS} dias para liberar tudo.`}
        </p>
      )}
      {entitlements.cancelAtPeriodEnd && (
        <p className={styles.planCardNote}>
          Assinatura cancelada: o acesso continua ate o fim do periodo pago.
        </p>
      )}
    </section>
  );
}
