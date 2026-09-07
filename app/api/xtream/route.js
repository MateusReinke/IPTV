import { buildPlayerApiUrl } from '@/lib/xtream';
import { getRequestAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_PARAMS = ['category_id', 'series_id', 'vod_id', 'stream_id', 'limit'];

// POST rather than GET so the account's server/username/password travel in
// the request body instead of the URL - a query string ends up in the
// browser's history, in the Network panel's URL column and in any access log
// that records the request line, none of which should ever see a password.

export async function POST(request) {
  // Catalog calls are not on the hot path, so a session lookup per request is
  // affordable - and it stops the proxy being usable by anyone with the URL.
  const auth = await getRequestAuth(request);
  if (!auth) {
    return Response.json({ error: 'Faca login para carregar a playlist' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const server = body?.server;
  const username = body?.username;
  const password = body?.password;
  const action = body?.action || undefined;

  if (!server || !username || !password) {
    return Response.json(
      { error: 'Parametros obrigatorios ausentes: server, username, password' },
      { status: 400 }
    );
  }

  const extraParams = {};
  for (const key of ALLOWED_PARAMS) {
    const value = body?.[key];
    if (value) extraParams[key] = value;
  }

  let apiUrl;
  try {
    apiUrl = buildPlayerApiUrl({ server, username, password, action, extraParams });
  } catch (err) {
    return Response.json({ error: err.message || 'URL do servidor invalida' }, { status: 400 });
  }

  let upstream;
  try {
    upstream = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IPTV-Client/1.0)' },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
  } catch (err) {
    const message =
      err && err.name === 'TimeoutError'
        ? 'O servidor IPTV demorou demais para responder'
        : 'Nao foi possivel conectar ao servidor IPTV';
    return Response.json({ error: message }, { status: 502 });
  }

  const text = await upstream.text();

  if (!upstream.ok) {
    return Response.json(
      { error: `O servidor IPTV respondeu com erro ${upstream.status}` },
      { status: 502 }
    );
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return Response.json(
      { error: 'Resposta invalida do servidor IPTV (verifique a URL, usuario e senha)' },
      { status: 502 }
    );
  }

  return Response.json(data);
}
