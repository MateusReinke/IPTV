// Proxies IPTV stream bytes through our own origin. This is required because:
//  - Xtream panels are frequently plain http:// while this app may be served over
//    https://, which browsers block as mixed content if the <video> tag points
//    directly at the upstream URL.
//  - Panels usually don't send CORS headers, which hls.js needs for byte-range
//    fetches of .m3u8/.ts segments.
// For .m3u8 playlists we rewrite every segment/sub-playlist URL to route back
// through this same proxy, recursively.
//
// Access requires a play token issued by /api/play/lease: that is what keeps
// the proxy from being an open relay and what makes the per-plan screen limit
// enforceable. Verification is a signature check, so the hot path (one request
// per segment) never touches the database.
//
// The upstream URL itself never reaches the browser: it is only ever built
// server-side (from a playlist's server/username/password, see
// /api/play/lease) and handed back encrypted (the `e` parameter). That closes
// two things at once - the account's credentials no longer show up in the
// browser's network panel/history, and a caller can no longer point this
// proxy at an arbitrary http(s) URL of their choosing (an open relay / SSRF
// risk the old `url=` parameter had, gated only by holding *any* valid play
// token).

import { verifyPlayToken } from '@/lib/server/playToken';
import { decryptStreamTarget, encryptStreamTarget } from '@/lib/server/streamCrypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPSTREAM_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; IPTV-Client/1.0)' };

// Bounds only how long we wait for the upstream connection/headers. It must
// NOT bound the body transfer too - an aborted-after-N-seconds signal stays
// attached to the fetch for its whole lifetime, so if it fired while a movie
// or a slow live segment was still streaming it would kill the download mid
// playback. That is why the timer is cleared as soon as headers arrive.
const CONNECT_TIMEOUT_MS = 20000;

function isPlaylist(contentType, pathname) {
  if (/mpegurl|x-mpegurl/i.test(contentType)) return true;
  return /\.m3u8($|\?)/i.test(pathname);
}

async function proxied(absoluteUrl, token) {
  const e = await encryptStreamTarget(absoluteUrl);
  return `/api/stream?e=${encodeURIComponent(e)}&t=${encodeURIComponent(token)}`;
}

async function rewritePlaylist(text, baseUrl, token) {
  const lines = text.split(/\r?\n/);
  const out = await Promise.all(
    lines.map(async (line) => {
      if (line.startsWith('#')) {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch) {
          const abs = new URL(uriMatch[1], baseUrl).toString();
          return line.replace(uriMatch[0], `URI="${await proxied(abs, token)}"`);
        }
        return line;
      }
      const trimmed = line.trim();
      if (!trimmed) return line;
      const abs = new URL(trimmed, baseUrl).toString();
      return proxied(abs, token);
    })
  );
  return out.join('\n');
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const encryptedTarget = searchParams.get('e');
  const token = searchParams.get('t') || '';

  if (!encryptedTarget) {
    return new Response('Missing e parameter', { status: 400 });
  }

  let claim;
  try {
    claim = await verifyPlayToken(token);
  } catch (err) {
    return new Response(err.message, { status: 503 });
  }
  if (!claim) {
    // 401 rather than 403: the client's move is to renew its lease.
    return new Response('Play token invalido ou expirado', { status: 401 });
  }

  const target = await decryptStreamTarget(encryptedTarget);
  if (!target) {
    return new Response('Parametro e invalido ou expirado', { status: 400 });
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response('Invalid target', { status: 400 });
  }
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return new Response('Unsupported protocol', { status: 400 });
  }

  const headers = { ...UPSTREAM_HEADERS };
  const range = request.headers.get('range');
  if (range) headers.Range = range;

  const controller = new AbortController();
  const connectTimer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

  let upstream;
  try {
    upstream = await fetch(targetUrl.toString(), {
      headers,
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    return new Response('Failed to reach stream server', { status: 502 });
  } finally {
    // Headers are in hand (or the fetch failed) - stop the timer so it can
    // never fire later and abort the body while it is still streaming out.
    clearTimeout(connectTimer);
  }

  const contentType = upstream.headers.get('content-type') || '';

  if (isPlaylist(contentType, targetUrl.pathname)) {
    const text = await upstream.text();
    const rewritten = await rewritePlaylist(text, targetUrl, token);
    return new Response(rewritten, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        // Ask reverse proxies (Traefik/nginx in front of the app, e.g. on Coolify)
        // not to buffer this response - buffering breaks/delays live HLS playback.
        'X-Accel-Buffering': 'no',
      },
    });
  }

  const respHeaders = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name);
    if (value) respHeaders.set(name, value);
  }
  respHeaders.set('Cache-Control', 'no-store');
  respHeaders.set('Access-Control-Allow-Origin', '*');
  respHeaders.set('X-Accel-Buffering', 'no');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}
