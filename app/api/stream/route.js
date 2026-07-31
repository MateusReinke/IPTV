// Proxies IPTV stream bytes through our own origin. This is required because:
//  - Xtream panels are frequently plain http:// while this app may be served over
//    https://, which browsers block as mixed content if the <video> tag points
//    directly at the upstream URL.
//  - Panels usually don't send CORS headers, which hls.js needs for byte-range
//    fetches of .m3u8/.ts segments.
// For .m3u8 playlists we rewrite every segment/sub-playlist URL to route back
// through this same proxy, recursively.

export const dynamic = 'force-dynamic';

const UPSTREAM_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; IPTV-Client/1.0)' };

function isPlaylist(contentType, pathname) {
  if (/mpegurl|x-mpegurl/i.test(contentType)) return true;
  return /\.m3u8($|\?)/i.test(pathname);
}

function rewritePlaylist(text, baseUrl) {
  const lines = text.split(/\r?\n/);
  const out = lines.map((line) => {
    if (line.startsWith('#')) {
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch) {
        const abs = new URL(uriMatch[1], baseUrl).toString();
        return line.replace(uriMatch[0], `URI="/api/stream?url=${encodeURIComponent(abs)}"`);
      }
      return line;
    }
    const trimmed = line.trim();
    if (!trimmed) return line;
    const abs = new URL(trimmed, baseUrl).toString();
    return `/api/stream?url=${encodeURIComponent(abs)}`;
  });
  return out.join('\n');
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url');
  if (!target) {
    return new Response('Missing url parameter', { status: 400 });
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response('Invalid url parameter', { status: 400 });
  }
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return new Response('Unsupported protocol', { status: 400 });
  }

  const headers = { ...UPSTREAM_HEADERS };
  const range = request.headers.get('range');
  if (range) headers.Range = range;

  let upstream;
  try {
    upstream = await fetch(targetUrl.toString(), {
      headers,
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return new Response('Failed to reach stream server', { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') || '';

  if (isPlaylist(contentType, targetUrl.pathname)) {
    const text = await upstream.text();
    const rewritten = rewritePlaylist(text, targetUrl);
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
