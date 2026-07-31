// Shared helpers for talking to an Xtream Codes panel (player_api.php).
// Used both by API route handlers (server) and client components.

export function normalizeServerUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Informe a URL do servidor');
  }
  const value = input.trim();
  if (!/^https?:\/\//i.test(value)) {
    throw new Error('A URL precisa comecar com http:// ou https://');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('URL invalida');
  }
  if (!url.hostname) {
    throw new Error('URL invalida');
  }
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

export function isValidServerUrl(input) {
  try {
    normalizeServerUrl(input);
    return true;
  } catch {
    return false;
  }
}

// Builds the upstream player_api.php URL. Only used server-side (app/api/xtream/route.js).
export function buildPlayerApiUrl({ server, username, password, action, extraParams }) {
  const base = normalizeServerUrl(server);
  const url = new URL('/player_api.php', base);
  url.searchParams.set('username', username);
  url.searchParams.set('password', password);
  if (action) url.searchParams.set('action', action);
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

// Calls our own /api/xtream proxy from the browser.
export async function xtreamRequest(playlist, action, extraParams) {
  const qs = new URLSearchParams({
    server: playlist.server,
    username: playlist.username,
    password: playlist.password,
  });
  if (action) qs.set('action', action);
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value !== undefined && value !== null && value !== '') {
        qs.set(key, String(value));
      }
    }
  }

  let res;
  try {
    res = await fetch(`/api/xtream?${qs.toString()}`, { cache: 'no-store' });
  } catch {
    throw new Error('Nao foi possivel conectar ao servidor IPTV');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || `Falha na requisicao (${res.status})`);
  }
  if (data && typeof data === 'object' && data.error) {
    throw new Error(data.error);
  }
  return data;
}

export function accountIsActive(userInfo) {
  if (!userInfo) return false;
  const status = String(userInfo.status || '').toLowerCase();
  if (status && status !== 'active') return false;
  if (userInfo.auth === 0 || userInfo.auth === '0') return false;
  return true;
}

const STREAM_PATH_BY_KIND = {
  live: 'live',
  movie: 'movie',
  series: 'series',
};

const DEFAULT_EXT_BY_KIND = {
  live: 'm3u8',
  movie: 'mp4',
  series: 'mp4',
};

// Raw upstream stream URL (contains credentials) - never render this directly in the DOM,
// always wrap with proxiedStreamUrl() first.
export function buildStreamUrl(playlist, kind, streamId, extension) {
  const base = normalizeServerUrl(playlist.server);
  const path = STREAM_PATH_BY_KIND[kind];
  if (!path) throw new Error(`Tipo de stream desconhecido: ${kind}`);
  const ext = (extension || DEFAULT_EXT_BY_KIND[kind] || 'mp4').replace(/^\./, '');
  const user = encodeURIComponent(playlist.username);
  const pass = encodeURIComponent(playlist.password);
  return `${base}/${path}/${user}/${pass}/${streamId}.${ext}`;
}

export function proxiedStreamUrl(rawUrl) {
  return `/api/stream?url=${encodeURIComponent(rawUrl)}`;
}

export function playableUrl(playlist, kind, streamId, extension) {
  return proxiedStreamUrl(buildStreamUrl(playlist, kind, streamId, extension));
}
