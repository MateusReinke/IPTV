'use client';

import { useMemo, useSyncExternalStore } from 'react';

// Favorites are kept in localStorage, one list per playlist (stream/series
// ids are only unique within a given Xtream server). Same
// useSyncExternalStore pattern as lib/playlists.js.

const STORAGE_PREFIX = 'iptv.favorites.';
const EMPTY = [];
const listeners = new Set();
const cache = new Map();

function storageKey(playlistId) {
  return `${STORAGE_PREFIX}${playlistId}`;
}

function readRaw(playlistId) {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(storageKey(playlistId));
}

function parseList(raw) {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(playlistId) {
  const raw = readRaw(playlistId);
  const cached = cache.get(playlistId);
  if (cached && cached.raw === raw) return cached.list;
  const list = parseList(raw);
  cache.set(playlistId, { raw, list });
  return list;
}

function getServerSnapshot() {
  return EMPTY;
}

function subscribe(callback) {
  listeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function persist(playlistId, list) {
  window.localStorage.setItem(storageKey(playlistId), JSON.stringify(list));
  cache.delete(playlistId);
  listeners.forEach((callback) => callback());
}

function favoriteKey(kind, id) {
  return `${kind}:${id}`;
}

export function useFavorites(playlistId) {
  return useSyncExternalStore(
    subscribe,
    () => (playlistId ? getSnapshot(playlistId) : EMPTY),
    getServerSnapshot
  );
}

// Set of "kind:id" keys for O(1) membership checks - recompute only when the
// underlying favorites list actually changes.
export function useFavoriteKeys(playlistId) {
  const favorites = useFavorites(playlistId);
  return useMemo(() => new Set(favorites.map((f) => favoriteKey(f.kind, f.id))), [favorites]);
}

export function toggleFavorite(playlistId, favorite) {
  if (!playlistId) return;
  const list = getSnapshot(playlistId);
  const targetKey = favoriteKey(favorite.kind, favorite.id);
  const exists = list.some((f) => favoriteKey(f.kind, f.id) === targetKey);
  const next = exists
    ? list.filter((f) => favoriteKey(f.kind, f.id) !== targetKey)
    : [...list, favorite];
  persist(playlistId, next);
}

// Build the stored favorite shape from a raw Xtream list item.
export function toFavoriteEntry(item, kind) {
  if (kind === 'live') {
    return { kind, id: item.stream_id, name: item.name, image: item.stream_icon };
  }
  if (kind === 'movie') {
    return {
      kind,
      id: item.stream_id,
      name: item.name,
      image: item.stream_icon,
      ext: item.container_extension || 'mp4',
    };
  }
  return { kind: 'series', id: item.series_id, name: item.name, image: item.cover };
}
