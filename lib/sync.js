'use client';

import { useSyncExternalStore } from 'react';
import {
  mergeLibraries,
  readLibrary,
  replaceLibrary,
  sameLibrary,
  subscribeLibrary,
} from './library';

// Cloud sync of the library (playlists, favorites, watch history).
//
// The account is the identity, so there is no code to memorise: the server
// stores one encrypted row per user and this module reconciles it with the
// local copy. Merging is the same last-write-wins pass used by file backups,
// which is what keeps two devices (and a stale one) from fighting.
//
// Requires the `sync` entitlement - the server enforces it, this module just
// stops asking when it is off.

const ENDPOINT = '/api/library';
const PUSH_DEBOUNCE_MS = 4000;
const POLL_INTERVAL_MS = 5 * 60 * 1000;

const INITIAL_STATE = Object.freeze({
  enabled: false,
  status: 'idle', // idle | syncing | ok | error | blocked
  error: '',
  lastSyncAt: 0,
});

let state = INITIAL_STATE;
const listeners = new Set();
let inFlight = null;
let lastPushed = '';

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useSyncState() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL_STATE
  );
}

async function runSync() {
  setState({ status: 'syncing', error: '' });
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-store' });
    if (res.status === 402 || res.status === 401) {
      const body = await res.json().catch(() => null);
      setState({ status: 'blocked', error: body?.error || 'Sincronizacao indisponivel' });
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `Falha ao ler do servidor (${res.status})`);
    }

    const remote = (await res.json())?.library || null;
    const local = readLibrary();
    const merged = remote ? mergeLibraries(local, remote) : local;
    if (!sameLibrary(merged, local)) replaceLibrary(merged);

    const serialized = JSON.stringify([merged.playlists, merged.favorites, merged.history]);
    if (serialized !== lastPushed) {
      const put = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ library: merged }),
      });
      if (!put.ok) {
        const body = await put.json().catch(() => null);
        throw new Error(body?.error || `Falha ao salvar no servidor (${put.status})`);
      }
      lastPushed = serialized;
    }

    setState({ status: 'ok', error: '', lastSyncAt: Date.now() });
  } catch (err) {
    setState({ status: 'error', error: err?.message || 'Falha ao sincronizar' });
  }
}

export function syncNow() {
  if (!state.enabled) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

// Called by SyncAgent. `enabled` follows the plan, so a trial ending simply
// stops the traffic instead of hammering a 402.
export function startAutoSync(enabled) {
  setState({ enabled, status: enabled ? 'idle' : 'blocked', error: '' });
  if (!enabled) return () => {};

  let timer;
  let disposed = false;
  lastPushed = '';

  const schedule = () => {
    if (disposed) return;
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
