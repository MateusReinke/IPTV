// What each plan unlocks. Pure logic, shared by the server (which enforces it)
// and the client (which explains it) - keep it free of imports so both can use it.
//
// The paid differentiator is multiview: watching several live channels at once
// with one of them carrying the audio. Watch history and cross-device sync are
// the other paid features.

// A misconfigured value here would otherwise reach Postgres as
// `'NaN days'::interval` and break every signup, so it falls back instead.
const configuredTrialDays = Number(process.env.NEXT_PUBLIC_TRIAL_DAYS);
export const TRIAL_DAYS =
  Number.isFinite(configuredTrialDays) && configuredTrialDays > 0
    ? Math.floor(configuredTrialDays)
    : 7;

export const PLANS = {
  free: {
    id: 'free',
    label: 'Gratuito',
    screens: 1,
    history: false,
    sync: false,
  },
  trial: {
    id: 'trial',
    label: `Teste de ${TRIAL_DAYS} dias`,
    screens: 9,
    history: true,
    sync: true,
  },
  premium: {
    id: 'premium',
    label: 'Premium',
    screens: 9,
    history: true,
    sync: true,
  },
};

// Grid options offered in multiview, and the smallest plan that reaches them.
export const LAYOUTS = [
  { id: '1x1', label: '1 tela', tiles: 1, columns: 1 },
  { id: '2x1', label: '2 telas', tiles: 2, columns: 2 },
  { id: '2x2', label: '4 telas', tiles: 4, columns: 2 },
  { id: '3x2', label: '6 telas', tiles: 6, columns: 3 },
  { id: '3x3', label: '9 telas', tiles: 9, columns: 3 },
];

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(from, to) {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86400000));
}

// Resolves a subscription row (or null) into what the account may do right now.
export function entitlementsFor(subscription, now = new Date()) {
  const trialEndsAt = toDate(subscription?.trial_ends_at ?? subscription?.trialEndsAt);
  const periodEnd = toDate(subscription?.current_period_end ?? subscription?.currentPeriodEnd);
  const status = subscription?.status || 'none';

  if (status === 'trialing' && trialEndsAt && trialEndsAt > now) {
    return build('trial', status, trialEndsAt, now, {
      trialing: true,
      cancelAtPeriodEnd: false,
    });
  }

  // `past_due` and `canceled` keep access until the period actually ends -
  // that is what the customer paid for, and it avoids cutting someone off
  // over a card retry.
  const paidStatuses = new Set(['active', 'past_due', 'canceled']);
  if (paidStatuses.has(status) && periodEnd && periodEnd > now) {
    return build('premium', status, periodEnd, now, {
      trialing: false,
      cancelAtPeriodEnd: !!(subscription?.cancel_at_period_end ?? subscription?.cancelAtPeriodEnd),
    });
  }

  return build('free', status === 'none' ? 'none' : 'expired', null, now, {
    trialing: false,
    cancelAtPeriodEnd: false,
    // Someone whose trial ran out has seen the product; the copy differs.
    trialUsed: !!trialEndsAt,
  });
}

function build(planId, status, expiresAt, now, extra) {
  const plan = PLANS[planId];
  return {
    plan: planId,
    planLabel: plan.label,
    status,
    features: { screens: plan.screens, history: plan.history, sync: plan.sync },
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    daysLeft: expiresAt ? daysBetween(now, expiresAt) : null,
    isPaid: planId === 'premium',
    isFree: planId === 'free',
    ...extra,
  };
}

export function maxLayoutFor(entitlements) {
  const screens = entitlements?.features?.screens || 1;
  return LAYOUTS.filter((layout) => layout.tiles <= screens);
}

export function layoutById(id) {
  return LAYOUTS.find((layout) => layout.id === id) || LAYOUTS[0];
}

// Short sentence explaining why something is locked, used across the UI.
export function lockReason(entitlements, feature) {
  if (entitlements?.features?.[feature]) return null;
  if (entitlements?.trialUsed) {
    return 'Seu teste gratuito terminou. Assine o Premium para voltar a usar este recurso.';
  }
  return 'Recurso disponivel no teste gratuito e no plano Premium.';
}
