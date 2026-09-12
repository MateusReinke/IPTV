'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { LAYOUTS, layoutById } from './entitlements';

// Multiview layout state: which channel sits in which tile, and which tile
// carries the audio. Stored per playlist in localStorage - it is a view
// preference, not library data, so it stays out of the synced document.

const STORAGE_KEY = 'iptv.multiview.v1';
const EMPTY = Object.freeze({ layoutId: '2x2', tiles: {}, audioTile: null });

const listeners = new Set();
let cachedRaw;
let cachedState = {};

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
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      cachedState = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      cachedState = {};
    }
  }
  return cachedState;
}

function getServerSnapshot() {
  return EMPTY_STATE;
}

const EMPTY_STATE = {};

function subscribe(callback) {
  listeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function write(next) {
  const serialized = JSON.stringify(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Preference only - losing it is not worth surfacing.
  }
  cachedRaw = serialized;
  cachedState = next;
  listeners.forEach((callback) => callback());
}

export function tileId(index) {
  return `tile-${index}`;
}

export function useMultiview(playlistId, maxScreens) {
  const all = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const state = useMemo(() => {
    const stored = (playlistId && all[playlistId]) || EMPTY;
    // A downgrade (trial ending) must not leave someone on a 9-tile layout.
    const allowed = LAYOUTS.filter((l) => l.tiles <= (maxScreens || 1));
    const requested = layoutById(stored.layoutId);
    const layout = allowed.some((l) => l.id === requested.id)
      ? requested
      : allowed[allowed.length - 1] || LAYOUTS[0];
    return {
      layout,
      tiles: stored.tiles || {},
      audioTile: stored.audioTile || null,
    };
  }, [all, playlistId, maxScreens]);

  const update = useCallback(
    (patch) => {
      if (!playlistId) return;
      const current = getSnapshot();
      const existing = current[playlistId] || EMPTY;
      write({
        ...current,
        [playlistId]: {
          layoutId: existing.layoutId || EMPTY.layoutId,
          tiles: existing.tiles || {},
          audioTile: existing.audioTile || null,
          ...patch,
        },
      });
    },
    [playlistId]
  );

  const setLayout = useCallback((layoutId) => update({ layoutId }), [update]);

  const setChannel = useCallback(
    (id, channel) => {
      const current = getSnapshot()[playlistId] || EMPTY;
      const tiles = { ...(current.tiles || {}) };
      if (channel) tiles[id] = channel;
      else delete tiles[id];
      // The first channel added takes the audio, so something is audible
      // without an extra click.
      const audioTile = channel && !current.audioTile ? id : current.audioTile;
      update({ tiles, audioTile: tiles[audioTile] ? audioTile : channel ? id : null });
    },
    [playlistId, update]
  );

  const setAudioTile = useCallback((id) => update({ audioTile: id }), [update]);

  const clearAll = useCallback(() => update({ tiles: {}, audioTile: null }), [update]);

  return { ...state, setLayout, setChannel, setAudioTile, clearAll };
}
