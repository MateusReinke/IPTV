// Display pricing. The amounts shown to visitors come from the environment so
// a price change does not need a code change; the amounts actually charged
// come from the Stripe price ids (or whatever provider is wired up).

import { TRIAL_DAYS } from './entitlements';

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Mosaico Play';

export const PRICING = {
  monthly: {
    id: 'monthly',
    label: 'Mensal',
    amount: Number(process.env.NEXT_PUBLIC_PRICE_MONTHLY || 19.9),
    period: 'mes',
    note: 'Cancele quando quiser',
  },
  yearly: {
    id: 'yearly',
    label: 'Anual',
    amount: Number(process.env.NEXT_PUBLIC_PRICE_YEARLY || 199),
    period: 'ano',
    note: 'Equivale a 2 meses gratis',
  },
  // Pagamento unico: sem "period" (nao e cobrado por mes/ano) - ver
  // ONE_TIME_PREMIUM_DAYS em lib/server/billing.js pelo prazo que libera.
  once: {
    id: 'once',
    label: 'Avulso',
    amount: Number(process.env.NEXT_PUBLIC_PRICE_ONCE || 19.9),
    period: null,
    note: 'Pagamento unico, sem renovacao automatica',
  },
};

export function formatBRL(amount) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
  } catch {
    return `R$ ${amount.toFixed(2).replace('.', ',')}`;
  }
}

export function monthlyEquivalent(plan) {
  return plan.period === 'ano' ? plan.amount / 12 : plan.amount;
}

// Quanto o Anual economiza vs pagar o Mensal 12 vezes - a vantagem real do
// plano, nao so o preco final (que sozinho nao deixa isso obvio).
export function yearlySavings() {
  const monthlyCost = PRICING.monthly.amount * 12;
  const amount = Math.max(0, monthlyCost - PRICING.yearly.amount);
  const percent = monthlyCost > 0 ? Math.round((amount / monthlyCost) * 100) : 0;
  return { amount, percent };
}

export const TRIAL_LABEL = `${TRIAL_DAYS} dias gratis`;
