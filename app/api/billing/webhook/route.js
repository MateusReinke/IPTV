import { applyProviderEvent, verifyProviderSignature } from '@/lib/server/billing';

// Subscription state of record comes from the provider, not from the browser
// returning to a success URL - a customer can close the tab mid-redirect and
// still have paid.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  // The signature covers the exact bytes, so the body must be read raw.
  const raw = await request.text();
  const signature = request.headers.get('stripe-signature');

  let valid;
  try {
    valid = verifyProviderSignature(raw, signature);
  } catch (err) {
    console.error('[webhook] not configured:', err.message);
    return new Response('webhook not configured', { status: 503 });
  }
  if (!valid) return new Response('invalid signature', { status: 400 });

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('invalid payload', { status: 400 });
  }

  try {
    await applyProviderEvent(event);
  } catch (err) {
    // Answer 500 so the provider retries: dropping an event silently would
    // leave a paying customer without access.
    console.error('[webhook] failed to apply', event?.type, err);
    return new Response('handler error', { status: 500 });
  }

  return Response.json({ received: true });
}
