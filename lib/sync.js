'use client';

import { useSyncExternalStore } from 'react';
import {
  mergeLibraries,
  readLibrary,
  replaceLibrary,
  sameLibrary,
  subscribeLibrary,
} from './library';

// Optional cross-device sync ("conta de sincronizacao").
//
// There is no e-mail/password account: the user gets a high-entropy *sync
// code*, and everything is derived from it in the browser.
//
//   accountId = SHA-256("iptv-sync-id:" + code)      -> what the server keys on
//   key       = PBKDF2(code, SHA-256("iptv-sync-salt:" + code)) -> AES-GCM key
//
// The library is encrypted before upload, so /api/library only ever holds an
// opaque blob: whoever runs the server (or reads its disk) cannot see the
// playlist credentials or what was watched. The code is the only secret, and
// it never leaves the browser.
//
// Because the salt is derived from the code, any device that knows the code
// derives the same key without extra bookkeeping - the code has ~100 bits of
// entropy, so a per-account random salt would buy nothing here.

const CONFIG_KEY = 'iptv.sync.v1';
const ENDPOINT = '/api/library';
const PBKDF2_ITERATIONS = 210000;
const PUSH_DEBOUNCE_MS = 4000;
const POLL_INTERVAL_MS = 5 * 60 * 1000;

// Crockford-flavoured base32: no I/L/O/U, so codes are safe to read out loud
// and to retype on a TV remote.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 20;
const GROUP_SIZE = 5;

const INITIAL_STATE = Object.freeze({
  ready: false,
  code: '',
  includePlaylists: true,
  status: 'idle', // idle | syncing | ok | error
  error: '',
  lastSyncAt: 0,
});

let state = INITIAL_STATE;
const listeners = new Set();
const keyCache = new Map();
let inFlight = null;
let lastPushedPayload = '';

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function readConfig() {
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeConfig(config) {
  try {
    if (config) {
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } else {
      window.localStorage.removeItem(CONFIG_KEY);
    }
  } catch {
    // Nothing useful to do: sync just stays session-only.
  }
}

function hydrateState() {
  if (state.ready) return;
  const config = readConfig();
  setState({
    ready: true,
    code: config?.code || '',
    includePlaylists: config?.includePlaylists !== false,
    lastSyncAt: config?.lastSyncAt || 0,
  });
}

function subscribeState(callback) {
  hydrateState();
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useSyncState() {
  return useSyncExternalStore(
    subscribeState,
    () => state,
    () => INITIAL_STATE
  );
}

// --------------------------------------------------------------------------
// Code handling

export function generateSyncCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return formatSyncCode(out);
}

export function formatSyncCode(code) {
  const clean = normalizeSyncCode(code);
  return (clean.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g')) || []).join('-');
}

export function normalizeSyncCode(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
}

export function isValidSyncCode(input) {
  const clean = normalizeSyncCode(input);
  return clean.length === CODE_LENGTH && [...clean].every((char) => ALPHABET.includes(char));
}

// --------------------------------------------------------------------------
// Crypto

function subtle() {
  const api = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!api) {
    // window.crypto.subtle only exists in a secure context.
    throw new Error(
      'A sincronizacao precisa de uma conexao segura (https:// ou localhost). ' +
        'Use backup em arquivo enquanto o app estiver sendo servido por http://.'
    );
  }
  return api;
}

export function syncAvailableInBrowser() {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function sha256(input) {
  return new Uint8Array(await subtle().digest('SHA-256', encoder.encode(input)));
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function accountIdFor(code) {
  return toHex(await sha256(`iptv-sync-id:${code}`));
}

// PBKDF2 is deliberately slow, so the derived key is memoised per code.
async function keyFor(code) {
  const cached = keyCache.get(code);
  if (cached) return cached;
  const promise = (async () => {
    const salt = await sha256(`iptv-sync-salt:${code}`);
    const material = await subtle().importKey('raw', encoder.encode(code), 'PBKDF2', false, [
      'deriveKey',
    ]);
    return subtle().deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  })();
  keyCache.set(code, promise);
  return promise;
}

async function encryptDocument(code, doc) {
  const key = await keyFor(code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await subtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(doc))
  );
  return { v: 1, iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) };
}

async function decryptDocument(code, envelope) {
  const key = await keyFor(code);
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv) },
    key,
    fromBase64(envelope.data)
  );
  return JSON.parse(decoder.decode(plain));
}

// --------------------------------------------------------------------------
// Transport

async function fetchRemote(accountId) {
  const res = await fetch(`${ENDPOINT}?id=${accountId}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Falha ao ler os dados do servidor (${res.status})`);
  }
  return res.json();
}

async function pushRemote(accountId, envelope) {
  const res = await fetch(`${ENDPOINT}?id=${accountId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(envelope),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Falha ao salvar no servidor (${res.status})`);
  }
}

export async function serverSyncAvailable() {
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    return { available: !!body?.available, detail: body?.detail };
  } catch {
    return { available: false, detail: 'network' };
  }
}

// --------------------------------------------------------------------------
// Sync

async function runSync() {
  const code = state.code;
  if (!code) return;

  setState({ status: 'syncing', error: '' });
  try {
    const accountId = await accountIdFor(code);
    const envelope = await fetchRemote(accountId);

    let remote = null;
    if (envelope) {
      try {
        remote = await decryptDocument(code, envelope);
      } catch {
        throw new Error(
          'Nao foi possivel abrir os dados salvos com este codigo. ' +
            'Confira se o codigo foi digitado corretamente.'
        );
      }
    }

    const local = readLibrary();
    const merged = remote
      ? mergeLibraries(local, remote, { includePlaylists: state.includePlaylists })
      : local;
    if (!sameLibrary(merged, local)) replaceLibrary(merged);

    // With credentials excluded we upload an empty playlist map: merging is a
    // union, so this never erases playlists another device did upload.
    const payload = state.includePlaylists ? merged : { ...merged, playlists: {} };
    const serialized = JSON.stringify([payload.playlists, payload.favorites, payload.history]);
    if (serialized !== lastPushedPayload) {
      await pushRemote(accountId, await encryptDocument(code, payload));
      lastPushedPayload = serialized;
    }

    const lastSyncAt = Date.now();
    setState({ status: 'ok', error: '', lastSyncAt });
    writeConfig({ code, includePlaylists: state.includePlaylists, lastSyncAt });
  } catch (err) {
    setState({ status: 'error', error: err?.message || 'Falha ao sincronizar' });
    throw err;
  }
}

export function syncNow() {
  if (!state.code) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = runSync()
    .catch(() => {})
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

function saveAndSync(code, includePlaylists) {
  lastPushedPayload = '';
  writeConfig({ code, includePlaylists, lastSyncAt: 0 });
  setState({ code, includePlaylists, status: 'syncing', error: '', lastSyncAt: 0 });
  return syncNow();
}

export async function createSyncAccount({ includePlaylists = true } = {}) {
  const code = normalizeSyncCode(generateSyncCode());
  await saveAndSync(code, includePlaylists);
  return formatSyncCode(code);
}

export async function connectSyncAccount(inputCode, { includePlaylists = true } = {}) {
  if (!isValidSyncCode(inputCode)) {
    throw new Error('Codigo invalido. Ele tem 20 caracteres, no formato XXXXX-XXXXX-XXXXX-XXXXX.');
  }
  await saveAndSync(normalizeSyncCode(inputCode), includePlaylists);
}

export function setIncludePlaylists(includePlaylists) {
  if (!state.code) {
    setState({ includePlaylists });
    return;
  }
  lastPushedPayload = '';
  setState({ includePlaylists });
  writeConfig({ code: state.code, includePlaylists, lastSyncAt: state.lastSyncAt });
  syncNow();
}

export async function disconnectSync({ deleteRemote = false } = {}) {
  const code = state.code;
  if (code && deleteRemote) {
    try {
      const accountId = await accountIdFor(code);
      await fetch(`${ENDPOINT}?id=${accountId}`, { method: 'DELETE' });
    } catch {
      // The local disconnect still goes through - the blob is unreadable
      // without the code anyway.
    }
  }
  keyCache.clear();
  lastPushedPayload = '';
  writeConfig(null);
  setState({ code: '', status: 'idle', error: '', lastSyncAt: 0 });
}

// Wires up automatic syncing: once on mount, whenever the library changes
// (debounced), when the tab becomes visible again, and on a slow poll so a
// second device's changes eventually land here too.
export function startAutoSync() {
  hydrateState();
  let timer;
  let disposed = false;

  const schedule = () => {
    if (disposed || !state.code) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow(), PUSH_DEBOUNCE_MS);
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') syncNow();
  };

  const unsubscribe = subscribeLibrary(schedule);
  document.addEventListener('visibilitychange', onVisible);
  const interval = setInterval(() => syncNow(), POLL_INTERVAL_MS);
  syncNow();

  return () => {
    disposed = true;
    clearTimeout(timer);
    clearInterval(interval);
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
