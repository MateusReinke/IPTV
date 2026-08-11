'use client';

import { useMemo } from 'react';
import { liveEntries, readLibrary, updateLibrary, useHydrated, useLibrary } from './library';

// Playlists (Xtream credentials) are one of the three sections of the local
// library document - see lib/library.js. They stay in the browser by default;
// they only ever leave it if the user turns on sync, and even then they are
// encrypted client-side first (lib/sync.js).

export function useLocalPlaylists() {
  const library = useLibrary();
  return useMemo(
    () => liveEntries(library.playlists).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)),
    [library]
  );
}

// Returns `undefined` while localStorage has not been read yet (SSR and the
// hydrating render) and `null` only when the playlist really is gone, so
// callers can avoid flashing a "not found" state on first paint.
export function usePlaylist(id) {
  const playlists = useLocalPlaylists();
  const hydrated = useHydrated();
  if (!hydrated) return undefined;
  return playlists.find((p) => p.id === id) || null;
}

export function addPlaylist(playlist) {
  const now = Date.now();
  updateLibrary((draft) => {
    draft.playlists[playlist.id] = { ...playlist, addedAt: now, updatedAt: now };
  });
  return liveEntries(readLibrary().playlists);
}

export function removePlaylist(id) {
  const now = Date.now();
  updateLibrary((draft) => {
    if (!draft.playlists[id]) return;
    draft.playlists[id] = { id, deletedAt: now, updatedAt: now };
  });
  return liveEntries(readLibrary().playlists);
}

export function makePlaylistId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `pl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
