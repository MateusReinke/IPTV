import { dashboardStats, recentAudit } from '@/lib/server/admin';
import { PRICING, formatBRL, monthlyEquivalent } from '@/lib/pricing';
import { billingConfigured } from '@/lib/server/billing';
import AdminUsers from '@/components/AdminUsers';
import styles from './page.module.css';

// Operator view: how the business is doing, and the levers to fix an account.
// Rendered on the server so the first paint already has the numbers.

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const [stats, audit] = await Promise.all([dashboardStats(), recentAudit(12)]);

  // Rough MRR: everyone paying counted at the monthly price. Good enough to
  // watch the trend; the provider's dashboard is the source of truth.
  const estimatedMrr = stats.paying * monthlyEquivalent(PRICING.monthly);

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Visao geral</h1>
        {!billingConfigured() && (
          <p className={styles.warning}>
            Pagamento online desativado (sem STRIPE_SECRET_KEY). Voce ainda pode liberar acesso
            manualmente na tabela abaixo.
          </p>
        )}
      </header>

      <section className={styles.cards}>
        <Card label="Contas" value={stats.users} hint={`+${stats.users7d} nos ultimos 7 dias`} />
        <Card label="Em teste" value={stats.trialing} hint="periodo gratuito ativo" tone="trial" />
        <Card label="Assinantes" value={stats.paying} hint="acesso pago vigente" tone="paid" />
        <Card
          label="Receita recorrente"
          value={formatBRL(estimatedMrr)}
          hint="estimativa mensal"
          tone="paid"
        />
        <Card label="Expirados" value={stats.expired} hint="sem acesso no momento" />
        <Card label="Ativos em 24h" value={stats.activeLast24h} hint="contas que usaram o app" />
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Cadastros (30 dias)</h2>
          <span className={styles.panelHint}>{stats.users30d} no periodo</span>
        </div>
        <SignupChart data={stats.signups} />
      </section>

      <AdminUsers />

      {audit.length > 0 && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Acoes recentes</h2>
          </div>
          <ul className={styles.audit}>
            {audit.map((entry, index) => (
              <li key={`${entry.created_at}-${index}`} className={styles.auditRow}>
                <span className={styles.auditAction}>{AUDIT_LABEL[entry.action] || entry.action}</span>
                <span className={styles.auditTarget}>{entry.target_email || '-'}</span>
                <span className={styles.auditMeta}>
                  {entry.actor_email} · {new Date(entry.created_at).toLocaleString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

const AUDIT_LABEL = {
  grant_premium: 'Liberou Premium',
  extend_trial: 'Estendeu teste',
  revoke_access: 'Revogou acesso',
  disable_user: 'Suspendeu conta',
  enable_user: 'Reativou conta',
  set_role: 'Alterou papel',
  password_reset_link: 'Gerou link de senha',
};

function Card({ label, value, hint, tone }) {
  return (
    <article className={`${styles.card} ${tone ? styles[`card_${tone}`] : ''}`}>
      <span className={styles.cardLabel}>{label}</span>
      <strong className={styles.cardValue}>{value}</strong>
      {hint && <span className={styles.cardHint}>{hint}</span>}
    </article>
  );
}

// Bar chart drawn with plain elements: no chart dependency for six pixels of
// trend, and it scales with the container.
function SignupChart({ data }) {
  const max = Math.max(1, ...data.map((point) => point.signups));
  return (
    <div className={styles.chart}>
      {data.map((point) => (
        <div
          key={point.day}
          className={styles.bar}
          title={`${new Date(`${point.day}T12:00:00`).toLocaleDateString('pt-BR')}: ${point.signups}`}
        >
          {/* A day with no signups shows the empty track, not a stub bar. */}
          {point.signups > 0 && (
            <span
              className={styles.barFill}
              style={{ height: `${Math.max(8, (point.signups / max) * 100)}%` }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
