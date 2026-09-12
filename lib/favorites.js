'use client';

import { useMemo } from 'react';
import { entryKey, liveEntries, readLibrary, updateLibrary, useLibrary } from './library';

// Favorites are stored per playlist (stream/series ids are only unique within
// a given Xtream server) inside the shared library document - see
// lib/library.js for the storage/merge model.

const EMPTY = [];

function favoriteKey(kind, id) {
  return `${kind}:${id}`;
}

export function useFavorites(playlistId) {
  const library = useLibrary();
  return useMemo(() => {
    if (!playlistId) return EMPTY;
    return liveEntries(library.favorites)
      .filter((fav) => fav.playlistId === playlistId)
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }, [library, playlistId]);
}

// Set of "kind:id" keys for O(1) membership checks - recomputed only when the
// underlying favorites actually change.
export function useFavoriteKeys(playlistId) {
  const favorites = useFavorites(playlistId);
  return useMemo(() => new Set(favorites.map((f) => favoriteKey(f.kind, f.id))), [favorites]);
}

export function isFavorited(playlistId, kind, id) {
  const entry = readLibrary().favorites[entryKey(playlistId, kind, id)];
  return !!entry && !entry.deletedAt;
}

export function toggleFavorite(playlistId, favorite) {
  if (!playlistId || !favorite) return;
  const key = entryKey(playlistId, favorite.kind, favorite.id);
  const now = Date.now();
  const existing = readLibrary().favorites[key];
  updateLibrary((draft) => {
    if (existing && !existing.deletedAt) {
      draft.favorites[key] = {
        playlistId,
        kind: favorite.kind,
        id: favorite.id,
        deletedAt: now,
        updatedAt: now,
      };
    } else {
      draft.favorites[key] = {
        ...favorite,
        playlistId,
        addedAt: existing?.addedAt || now,
        updatedAt: now,
        deletedAt: undefined,
      };
    }
  });
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
