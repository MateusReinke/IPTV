import { createHmac, timingSafeEqual } from 'node:crypto';
import { query, queryOne } from './db';

// Billing lives behind a small seam: everything the app needs is
// `startCheckout`, `openPortal` and `applyProviderEvent`. Stripe is the
// implementation shipped here; swapping in Mercado Pago (for PIX/boleto)
// means writing the same three functions and a signature check.
//
// With no provider configured the product still works end to end: trials run
// on signup and the admin panel can grant or revoke access by hand.

const STRIPE_API = 'https://api.stripe.com/v1';
const SIGNATURE_TOLERANCE_SECONDS = 300;

export function billingProvider() {
  return process.env.STRIPE_SECRET_KEY ? 'stripe' : null;
}

export function billingConfigured() {
  return !!billingProvider();
}

export function priceIdFor(planId) {
  return planId === 'yearly' ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
}

// Stripe's API is form-encoded, including nested structures.
function toForm(object, prefix = '', form = new URLSearchParams()) {
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === 'object') toForm(item, `${name}[${index}]`, form);
        else form.set(`${name}[${index}]`, String(item));
      });
    } else if (typeof value === 'object') {
      toForm(value, name, form);
    } else {
      form.set(name, String(value));
    }
  }
  return form;
}

async function stripeRequest(path, body) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Pagamentos nao estao configurados neste servidor.');

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: toForm(body || {}).toString(),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message || `Falha na comunicacao com o Stripe (${res.status})`);
  }
  return data;
}

async function ensureCustomer(user) {
  const row = await queryOne('select provider_customer_id from subscriptions where user_id = $1', [
    user.id,
  ]);
  if (row?.provider_customer_id) return row.provider_customer_id;

  const customer = await stripeRequest('/customers', {
    email: user.email,
    name: user.name || undefined,
    metadata: { user_id: user.id },
  });

  await query(
    `insert into subscriptions (user_id, plan, status, provider, provider_customer_id)
     values ($1, 'trial', 'trialing', 'stripe', $2)
     on conflict (user_id) do update
       set provider = 'stripe', provider_customer_id = excluded.provider_customer_id,
           updated_at = now()`,
    [user.id, customer.id]
  );
  return customer.id;
}

export async function startCheckout({ user, planId, origin }) {
  const price = priceIdFor(planId);
  if (!price) throw new Error('Plano indisponivel: configure os precos no Stripe.');
  const customer = await ensureCustomer(user);

  const session = await stripeRequest('/checkout/sessions', {
    mode: 'subscription',
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/app/conta?checkout=sucesso`,
    cancel_url: `${origin}/app/conta?checkout=cancelado`,
    subscription_data: { metadata: { user_id: user.id } },
    metadata: { user_id: user.id },
  });

  return session.url;
}

export async function openPortal({ user, origin }) {
  const customer = await ensureCustomer(user);
  const session = await stripeRequest('/billing_portal/sessions', {
    customer,
    return_url: `${origin}/app/conta`,
  });
  return session.url;
}

export function verifyProviderSignature(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET nao configurado');

  const parts = Object.fromEntries(
    String(signatureHeader || '')
      .split(',')
      .map((piece) => piece.split('='))
      .filter((pair) => pair.length === 2)
  );
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const provided = String(parts.v1 || '');
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

function toTimestamp(seconds) {
  return seconds ? new Date(Number(seconds) * 1000) : null;
}

async function userIdForEvent(object) {
  const direct = object?.metadata?.user_id || object?.client_reference_id;
  if (direct) return direct;
  const customerId = typeof object?.customer === 'string' ? object.customer : object?.customer?.id;
  if (!customerId) return null;
  const row = await queryOne('select user_id from subscriptions where provider_customer_id = $1', [
    customerId,
  ]);
  return row?.user_id || null;
}

async function upsertSubscription(userId, patch) {
  await query(
    `insert into subscriptions (user_id, plan, status, current_period_end,
                                cancel_at_period_end, provider,
                                provider_customer_id, provider_subscription_id, updated_at)
     values ($1, $2, $3, $4, $5, 'stripe', $6, $7, now())
     on conflict (user_id) do update
       set plan = excluded.plan,
           status = excluded.status,
           current_period_end = coalesce(excluded.current_period_end, subscriptions.current_period_end),
           cancel_at_period_end = excluded.cancel_at_period_end,
           provider = 'stripe',
           provider_customer_id = coalesce(excluded.provider_customer_id, subscriptions.provider_customer_id),
           provider_subscription_id = coalesce(excluded.provider_subscription_id, subscriptions.provider_subscription_id),
           updated_at = now()`,
    [
      userId,
      patch.plan,
      patch.status,
      patch.currentPeriodEnd,
      !!patch.cancelAtPeriodEnd,
      patch.customerId || null,
      patch.subscriptionId || null,
    ]
  );
}

// Returns true when the event was applied, false when it was a duplicate or
// irrelevant. Stripe retries on non-2xx, so callers should still answer 200.
export async function applyProviderEvent(event) {
  const inserted = await query(
    `insert into billing_events (id, provider, type, payload)
     values ($1, 'stripe', $2, $3)
     on conflict (id) do nothing
     returning id`,
    [event.id, event.type, event]
  );
  if (inserted.rows.length === 0) return false;

  const object = event.data?.object || {};

  if (event.type === 'checkout.session.completed') {
    const userId = await userIdForEvent(object);
    if (!userId) return false;
    await upsertSubscription(userId, {
      plan: 'premium',
      status: 'active',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      customerId: typeof object.customer === 'string' ? object.customer : null,
      subscriptionId: typeof object.subscription === 'string' ? object.subscription : null,
    });
    return true;
  }

  if (event.type.startsWith('customer.subscription.')) {
    const userId = await userIdForEvent(object);
    if (!userId) return false;
    const deleted = event.type === 'customer.subscription.deleted';
    await upsertSubscription(userId, {
      plan: 'premium',
      status: deleted ? 'canceled' : object.status || 'active',
      currentPeriodEnd: toTimestamp(object.current_period_end),
      cancelAtPeriodEnd: !!object.cancel_at_period_end,
      customerId: typeof object.customer === 'string' ? object.customer : null,
      subscriptionId: object.id || null,
    });
    return true;
  }

  return false;
}
