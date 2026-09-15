import { getRequestAuth } from '@/lib/server/auth';
import { queryOne } from '@/lib/server/db';
import { aiConfigured, pickWithAI } from '@/lib/server/ai';
import { rateLimit, tooManyRequests } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_KINDS = new Set(['movie', 'series']);
const MAX_ITEMS = 150;
const MAX_NAMES = 20;

// A conta (nao a playlist) e a unidade do cooldown: o motivo dele existir e
// controlar o custo de API do operador, e isso nao muda por playlist.
function cooldownDays() {
  const n = Number(process.env.NEXT_PUBLIC_AI_PICK_COOLDOWN_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function toPublicPick(row) {
  if (!row) return null;
  const availableAt = new Date(new Date(row.picked_at).getTime() + cooldownDays() * 86400000);
  return {
    item: row.item,
    reason: row.reason,
    kind: row.kind,
    pickedAt: row.picked_at,
    availableAt: availableAt.toISOString(),
  };
}

async function currentRow(userId) {
  return queryOne(
    'select playlist_id, kind, item, reason, picked_at from ai_picks where user_id = $1',
    [userId]
  );
}

// The cooldown exists to bound the operator's AI spend on the plan that
// doesn't pay for it. Trial and Premium already get the full feature set
// everywhere else (lib/entitlements.js PLANS) - the free tier is the outlier
// here, not the other way around.
function hasUnlimitedPicks(auth) {
  return auth.entitlements?.isFree === false;
}

export async function GET(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: 'Faca login para usar a escolha da IA' }, { status: 401 });

  const configured = aiConfigured();
  const pick = toPublicPick(await currentRow(auth.user.id));
  const canPickNow =
    configured && (hasUnlimitedPicks(auth) || !pick || new Date(pick.availableAt) <= new Date());

  return Response.json({ configured, pick, canPickNow });
}

// POST recebe o catalogo (ja carregado pelo cliente via /api/xtream) em vez
// de credenciais Xtream - o servidor de IA nunca precisa delas, so escolhe
// entre os itens que o navegador ja tem.
export async function POST(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: 'Faca login para usar a escolha da IA' }, { status: 401 });

  if (!aiConfigured()) {
    return Response.json(
      { error: 'Recomendacao por IA nao configurada neste servidor.' },
      { status: 501 }
    );
  }

  const limit = rateLimit(`ai-pick:${auth.user.id}`, { limit: 5, windowMs: 60000 });
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const body = await request.json().catch(() => null);
  const kind = body?.kind;
  if (!VALID_KINDS.has(kind)) {
    return Response.json({ error: 'kind precisa ser "movie" ou "series"' }, { status: 400 });
  }

  const items = Array.isArray(body?.items)
    ? body.items
        .filter((item) => item && item.id !== undefined && item.id !== null && item.name)
        .slice(0, MAX_ITEMS)
        .map((item) => ({
          id: String(item.id),
          name: String(item.name).slice(0, 200),
          image: item.image ? String(item.image).slice(0, 500) : undefined,
          ext: item.ext ? String(item.ext).slice(0, 10) : undefined,
          genre: item.genre ? String(item.genre).slice(0, 80) : undefined,
          rating: Number(item.rating) || undefined,
          plot: item.plot ? String(item.plot).slice(0, 300) : undefined,
        }))
    : [];
  if (items.length === 0) {
    return Response.json({ error: 'Catalogo vazio' }, { status: 400 });
  }

  const favoriteNames = Array.isArray(body?.favoriteNames)
    ? body.favoriteNames.slice(0, MAX_NAMES).map((n) => String(n).slice(0, 200))
    : [];
  const historyNames = Array.isArray(body?.historyNames)
    ? body.historyNames.slice(0, MAX_NAMES).map((n) => String(n).slice(0, 200))
    : [];
  const playlistId = typeof body?.playlistId === 'string' ? body.playlistId.slice(0, 200) : null;
  const theme = typeof body?.theme === 'string' ? body.theme.trim().slice(0, 40) || undefined : undefined;

  if (!hasUnlimitedPicks(auth)) {
    const existing = await currentRow(auth.user.id);
    if (existing) {
      const availableAt = new Date(new Date(existing.picked_at).getTime() + cooldownDays() * 86400000);
      if (availableAt > new Date()) {
        return Response.json(
          { error: 'Ainda no periodo de espera', pick: toPublicPick(existing), canPickNow: false },
          { status: 429 }
        );
      }
    }
  }

  let result;
  try {
    result = await pickWithAI({ kind, items, favoriteNames, historyNames, theme });
  } catch (err) {
    return Response.json({ error: err.message || 'Falha ao consultar a IA' }, { status: 502 });
  }

  const row = await queryOne(
    `insert into ai_picks (user_id, playlist_id, kind, item, reason, picked_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (user_id) do update
       set playlist_id = excluded.playlist_id,
           kind = excluded.kind,
           item = excluded.item,
           reason = excluded.reason,
           picked_at = now()
     returning playlist_id, kind, item, reason, picked_at`,
    [auth.user.id, playlistId, kind, result.item, result.reason]
  );

  return Response.json({ pick: toPublicPick(row), canPickNow: hasUnlimitedPicks(auth) });
}
