import { getRequestAuth } from '@/lib/server/auth';
import {
  MAX_LIBRARY_BYTES,
  deleteLibrary,
  libraryStorageConfigured,
  readLibrary,
  writeLibrary,
} from '@/lib/server/libraryStore';

// Cloud copy of the user's library (playlists, favorites, watch history).
// Requires an account *and* the `sync` entitlement - this is one of the paid
// features, so the check lives on the server rather than in the UI.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unavailable() {
  return Response.json(
    {
      error:
        'A sincronizacao nao esta habilitada neste servidor: defina APP_ENCRYPTION_KEY (32 bytes em base64).',
      code: 'NOT_CONFIGURED',
    },
    { status: 503 }
  );
}

function paymentRequired(entitlements) {
  return Response.json(
    {
      error:
        entitlements?.trialUsed
          ? 'Seu teste terminou. Assine o Premium para continuar sincronizando favoritos e historico.'
          : 'Sincronizar favoritos e historico faz parte do Premium.',
      code: 'UPGRADE_REQUIRED',
    },
    { status: 402 }
  );
}

export async function GET(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: 'Nao autenticado' }, { status: 401 });
  if (!libraryStorageConfigured()) return unavailable();
  if (!auth.entitlements.features.sync) return paymentRequired(auth.entitlements);

  const stored = await readLibrary(auth.user.id);
  if (!stored) return Response.json({ library: null, revision: 0 });
  return Response.json({
    library: stored.document,
    revision: stored.revision,
    updatedAt: stored.updatedAt,
  });
}

export async function PUT(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: 'Nao autenticado' }, { status: 401 });
  if (!libraryStorageConfigured()) return unavailable();
  if (!auth.entitlements.features.sync) return paymentRequired(auth.entitlements);

  const raw = await request.text();
  if (raw.length > MAX_LIBRARY_BYTES) {
    return Response.json({ error: 'Biblioteca grande demais para sincronizar' }, { status: 413 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Corpo invalido' }, { status: 400 });
  }

  const document = body?.library;
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return Response.json({ error: 'Formato de biblioteca invalido' }, { status: 400 });
  }

  const saved = await writeLibrary(auth.user.id, {
    version: 1,
    playlists: document.playlists && typeof document.playlists === 'object' ? document.playlists : {},
    favorites: document.favorites && typeof document.favorites === 'object' ? document.favorites : {},
    history: document.history && typeof document.history === 'object' ? document.history : {},
  });

  return Response.json({ ok: true, ...saved });
}

export async function DELETE(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: 'Nao autenticado' }, { status: 401 });
  await deleteLibrary(auth.user.id);
  return Response.json({ ok: true });
}
