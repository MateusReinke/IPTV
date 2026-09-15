import { getRequestAuth } from '@/lib/server/auth';
import { describeDatabaseError } from '@/lib/server/db';
import { aiPickStatus, releaseAiPick, reserveAiPick, settleAiPick } from '@/lib/server/picks';
import { aiProvider, recommend, sanitizeCandidates, sanitizeProfile } from '@/lib/server/recommend';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The AI pick. GET reports what the plan allows (so the dialog can explain
// itself before spending anything); POST spends one and returns the film.
//
// The catalog never touches this server on its own: the browser already has
// it loaded and sends the slice worth considering. That keeps the endpoint
// out of the business of holding IPTV credentials, and keeps the prompt small.

const KINDS = new Set(['movie', 'series']);

export async function GET(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: 'Faca login para usar a indicacao' }, { status: 401 });

  try {
    const status = await aiPickStatus(auth.user.id, auth.entitlements);
    return Response.json({ ...status, plan: auth.entitlements.plan, engine: aiProvider() || 'local' });
  } catch (err) {
    console.error('[recommend] status falhou', err);
    return Response.json({ error: describeDatabaseError(err) }, { status: 503 });
  }
}

export async function POST(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: 'Faca login para usar a indicacao' }, { status: 401 });

  // The quota below is the real limit; this only stops a paid account (which
  // has no cooldown) from turning a stuck button into an API bill.
  const limited = rateLimit(`recommend:${auth.user.id}`, { limit: 20, windowMs: 3600000 });
  if (!limited.allowed) return tooManyRequests(limited.retryAfter);
  const perIp = rateLimit(`recommend-ip:${clientIp(request)}`, { limit: 40, windowMs: 3600000 });
  if (!perIp.allowed) return tooManyRequests(perIp.retryAfter);

  const body = await request.json().catch(() => null);
  const kind = KINDS.has(body?.kind) ? body.kind : 'movie';
  const genre = body?.genre ? String(body.genre).slice(0, 120) : '';
  const candidates = sanitizeCandidates(body?.candidates);
  const profile = sanitizeProfile(body?.profile);

  if (candidates.length === 0) {
    return Response.json(
      { error: 'Nenhum titulo disponivel para indicar. Tente outro genero.' },
      { status: 400 }
    );
  }

  let reservation;
  try {
    reservation = await reserveAiPick({
      userId: auth.user.id,
      plan: auth.entitlements.plan,
      kind,
      genre,
      entitlements: auth.entitlements,
    });
  } catch (err) {
    console.error('[recommend] reserva falhou', err);
    return Response.json({ error: describeDatabaseError(err) }, { status: 503 });
  }

  if (!reservation.ok) {
    return Response.json(
      {
        error: `No plano gratuito a indicacao da IA vale uma vez a cada ${reservation.cooldownDays} dias.`,
        quota: {
          allowed: false,
          unlimited: false,
          cooldownDays: reservation.cooldownDays,
          nextAvailableAt: reservation.nextAvailableAt,
        },
      },
      { status: 429 }
    );
  }

  let result;
  try {
    result = await recommend({ candidates, profile, genre });
  } catch (err) {
    console.error('[recommend] falhou', err);
    result = null;
  }

  if (!result) {
    // Nothing was recommended, so nothing was spent.
    await releaseAiPick(reservation.id);
    return Response.json(
      { error: 'Nao foi possivel montar a indicacao agora. Tente de novo em instantes.' },
      { status: 502 }
    );
  }

  await settleAiPick(reservation.id, { engine: result.engine, pickName: result.pick.name });

  let quota;
  try {
    quota = await aiPickStatus(auth.user.id, auth.entitlements);
  } catch {
    quota = null;
  }

  return Response.json({
    kind,
    genre: genre || null,
    pick: result.pick,
    reason: result.reason,
    profileNote: result.profileNote,
    alternates: result.alternates,
    engine: result.engine,
    // True when the model was configured but could not answer, so the UI can
    // say the pick came from the fallback ranking.
    degraded: !!result.degraded,
    quota,
  });
}
