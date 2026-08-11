// Display pricing. The amounts shown to visitors come from the environment so
// a price change does not need a code change; the amounts actually charged
// come from the Stripe price ids (or whatever provider is wired up).

import { TRIAL_DAYS } from './entitlements';

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Multitela';

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

export const TRIAL_LABEL = `${TRIAL_DAYS} dias gratis`;
