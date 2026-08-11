'use client';

import { useMemo, useSyncExternalStore } from 'react';

// The "library" is the single document holding everything the user builds up
// over time: playlists, favorites and watch history. It still lives in
// localStorage (no login required, works offline), but it is shaped as a
// *syncable* document rather than a handful of ad-hoc keys:
//
//   - entries live in maps keyed by a stable id and carry an `updatedAt`
//   - deletions leave a tombstone (`deletedAt`) instead of vanishing
//
// That is what makes `mergeLibraries()` a pure last-write-wins merge, and in
// turn what lets lib/sync.js reconcile two devices without a stale phone
// resurrecting a favorite you removed on the TV.
//
// Reads go through useSyncExternalStore (React's sanctioned way to subscribe
// to state living outside React) so components always observe a consistent
// snapshot without mirroring localStorage into effects.

const STORAGE_KEY = 'iptv.library.v1';
const LEGACY_PLAYLISTS_KEY = 'iptv.playlists.v1';
const LEGACY_FAVORITES_PREFIX = 'iptv.favorites.';

// Tombstones only need to outlive the longest plausible gap between two
// devices syncing; after that they are dead weight.
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_ENTRIES = 400;

export const EMPTY_LIBRARY = Object.freeze({
  version: 1,
  updatedAt: 0,
  playlists: Object.freeze({}),
  favorites: Object.freeze({}),
  history: Object.freeze({}),
});

const listeners = new Set();
let cachedRaw;
let cachedDoc = EMPTY_LIBRARY;
let migrationChecked = false;

export function entryKey(playlistId, kind, id) {
  return `${playlistId}|${kind}:${id}`;
}

function asMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseDoc(raw) {
  if (!raw) return EMPTY_LIBRARY;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_LIBRARY;
    return {
      version: 1,
      updatedAt: Number(parsed.updatedAt) || 0,
      playlists: asMap(parsed.playlists),
      favorites: asMap(parsed.favorites),
      history: asMap(parsed.history),
    };
  } catch {
    return EMPTY_LIBRARY;
  }
}

function readRaw() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot() {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedDoc = parseDoc(raw);
  }
  return cachedDoc;
}

function getServerSnapshot() {
  return EMPTY_LIBRARY;
}

function subscribe(callback) {
  // Migration writes to localStorage, so it must not run during render.
  // `subscribe` runs in an effect, and useSyncExternalStore re-reads the
  // snapshot right after subscribing, so the migrated data shows up at once.
  runLegacyMigration();
  listeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function notify() {
  listeners.forEach((callback) => callback());
}

function tombstone(entry, now) {
  return {
    playlistId: entry?.playlistId,
    kind: entry?.kind,
    id: entry?.id,
    deletedAt: now,
    updatedAt: now,
  };
}

function pruneExpired(map, now) {
  const out = {};
  for (const [key, entry] of Object.entries(map)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.deletedAt && now - entry.deletedAt > TOMBSTONE_TTL_MS) continue;
    out[key] = entry;
  }
  return out;
}

// Keeps the document from growing without bound: expired tombstones go away
// and the oldest history rows past the cap become tombstones (rather than
// disappearing, which would let another device push them straight back).
function pruneDoc(doc, now) {
  const history = pruneExpired(doc.history, now);
  const live = Object.entries(history).filter(([, entry]) => !entry.deletedAt);
  if (live.length > MAX_HISTORY_ENTRIES) {
    live.sort((a, b) => (b[1].watchedAt || 0) - (a[1].watchedAt || 0));
    for (const [key, entry] of live.slice(MAX_HISTORY_ENTRIES)) {
      history[key] = tombstone(entry, now);
    }
  }
  return {
    version: 1,
    updatedAt: now,
    playlists: pruneExpired(doc.playlists, now),
    favorites: pruneExpired(doc.favorites, now),
    history,
  };
}

function write(doc) {
  if (typeof window === 'undefined') return;
  const next = pruneDoc(doc, Date.now());
  const serialized = JSON.stringify(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Quota exceeded / private mode: keep the in-memory copy so the current
    // session still behaves, and let the next write try again.
  }
  // Seeding the cache with exactly what was written matters for identity, not
  // just speed: re-reading the JSON would hand out brand-new objects for every
  // entry on every write, so anything watching a single entry (a useEffect
  // depending on a playlist, say) would see a change and write again - an
  // endless render/write loop.
  cachedRaw = serialized;
  cachedDoc = next;
  notify();
}

export function readLibrary() {
  return getSnapshot();
}

// Applies a mutation to a shallow copy of the document. The mutator receives
// a draft whose three maps are fresh objects, so it can assign into them.
export function updateLibrary(mutate) {
  const current = getSnapshot();
  const draft = {
    version: 1,
    updatedAt: current.updatedAt,
    playlists: { ...current.playlists },
    favorites: { ...current.favorites },
    history: { ...current.history },
  };
  mutate(draft);
  write(draft);
}

// Replaces the whole document (used by sync/import after merging).
export function replaceLibrary(doc) {
  write({
    version: 1,
    updatedAt: Date.now(),
    playlists: asMap(doc.playlists),
    favorites: asMap(doc.favorites),
    history: asMap(doc.history),
  });
}

function mergeMaps(local, remote) {
  const out = { ...asMap(local) };
  for (const [key, entry] of Object.entries(asMap(remote))) {
    if (!entry || typeof entry !== 'object') continue;
    const current = out[key];
    if (!current) {
      out[key] = entry;
      continue;
    }
    const currentAt = current.updatedAt || 0;
    const remoteAt = entry.updatedAt || 0;
    // On an exact tie a deletion wins, so a removal never bounces back.
    if (remoteAt > currentAt || (remoteAt === currentAt && entry.deletedAt && !current.deletedAt)) {
      out[key] = entry;
    }
  }
  return out;
}

export function mergeLibraries(local, remote, { includePlaylists = true } = {}) {
  return {
    version: 1,
    updatedAt: Math.max(local?.updatedAt || 0, remote?.updatedAt || 0),
    playlists: includePlaylists
      ? mergeMaps(local?.playlists, remote?.playlists)
      : asMap(local?.playlists),
    favorites: mergeMaps(local?.favorites, remote?.favorites),
    history: mergeMaps(local?.history, remote?.history),
  };
}

// Structural comparison used to decide whether a merge actually changed
// anything - without it, sync would write on every pass and re-trigger itself.
export function sameLibrary(a, b) {
  return (
    JSON.stringify([a?.playlists, a?.favorites, a?.history]) ===
    JSON.stringify([b?.playlists, b?.favorites, b?.history])
  );
}

export function liveEntries(map) {
  return Object.values(asMap(map)).filter((entry) => entry && !entry.deletedAt);
}

export function useLibrary() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Same subscription outside React, for lib/sync.js.
export function subscribeLibrary(callback) {
  return subscribe(callback);
}

// False during SSR and the first (hydrating) client render, true afterwards.
// Lets pages tell "localStorage says this does not exist" apart from "we have
// not read localStorage yet", instead of flashing a not-found state.
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}

export function useLibrarySection(section, selector) {
  const library = useLibrary();
  return useMemo(() => selector(library[section]), [library, section, selector]);
}

// ---------------------------------------------------------------------------
// Migration from the pre-library storage layout (an array of playlists under
// `iptv.playlists.v1`, plus one favorites array per playlist). The old keys
// are intentionally left untouched as a safety net.

function parseLegacyArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function runLegacyMigration() {
  if (migrationChecked || typeof window === 'undefined') return;
  migrationChecked = true;
  let storage;
  try {
    storage = window.localStorage;
    if (storage.getItem(STORAGE_KEY)) return;
  } catch {
    return;
  }

  const now = Date.now();
  const doc = { version: 1, updatedAt: now, playlists: {}, favorites: {}, history: {} };
  let found = false;

  parseLegacyArray(storage.getItem(LEGACY_PLAYLISTS_KEY)).forEach((playlist, index) => {
    if (!playlist || !playlist.id) return;
    found = true;
    doc.playlists[playlist.id] = { ...playlist, addedAt: now + index, updatedAt: now };
  });

  const favoriteKeys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && key.startsWith(LEGACY_FAVORITES_PREFIX)) favoriteKeys.push(key);
  }
  for (const key of favoriteKeys) {
    const playlistId = key.slice(LEGACY_FAVORITES_PREFIX.length);
    parseLegacyArray(storage.getItem(key)).forEach((favorite, index) => {
      if (!favorite || favorite.id === undefined || favorite.id === null) return;
      found = true;
      doc.favorites[entryKey(playlistId, favorite.kind, favorite.id)] = {
        ...favorite,
        playlistId,
        addedAt: now + index,
        updatedAt: now,
      };
    });
  }

  if (found) write(doc);
}
