'use client';

import { useMemo } from 'react';
import { entryKey, liveEntries, readLibrary, updateLibrary, useLibrary } from './library';

// Watch history: what was played, when, and how far. Stored in the shared
// library document (lib/library.js) so it survives alongside favorites and
// travels through the same backup/sync path.
//
// An entry looks like:
//   { playlistId, kind, id, name, image, ext,
//     seriesId, seriesName, season, episode,       // series only
//     position, duration, completed, watchedAt, updatedAt }
//
// `position`/`duration` are seconds. Live TV has neither - it is recorded
// only so recently watched channels can be surfaced again.

const EMPTY = [];

// Anything past this is treated as "finished" - trailing credits mean the
// last few seconds are rarely reached. The absolute tail is also capped to a
// share of the runtime, so a short clip is not "finished" the moment it starts.
const COMPLETION_RATIO = 0.97;
const COMPLETION_TAIL_SECONDS = 45;
const COMPLETION_TAIL_MAX_SHARE = 0.05;
// Below this, resuming would be more annoying than starting over.
const MIN_RESUME_SECONDS = 20;
const MAX_CONTINUE_ITEMS = 20;

export function isCompleted(entry) {
  if (!entry) return false;
  if (entry.completed) return true;
  const { position, duration } = entry;
  if (!duration || !position) return false;
  const tail = Math.min(COMPLETION_TAIL_SECONDS, duration * COMPLETION_TAIL_MAX_SHARE);
  return position >= duration - tail || position / duration >= COMPLETION_RATIO;
}

export function progressRatio(entry) {
  if (!entry || !entry.duration || !entry.position) return 0;
  if (isCompleted(entry)) return 1;
  return Math.min(1, Math.max(0, entry.position / entry.duration));
}

export function resumePosition(entry) {
  if (!entry || entry.kind === 'live') return 0;
  if (isCompleted(entry)) return 0;
  return entry.position > MIN_RESUME_SECONDS ? entry.position : 0;
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatWatchedAt(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `ha ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `ha ${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `ha ${days} dia${days > 1 ? 's' : ''}`;
  try {
    return new Date(timestamp).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

// Label shown under a history/continue card.
export function historySubtitle(entry) {
  if (!entry) return '';
  if (entry.kind === 'series' && entry.season && entry.episode) {
    return `T${entry.season} E${entry.episode}`;
  }
  if (entry.kind === 'live') return 'Ao vivo';
  return entry.kind === 'movie' ? 'Filme' : 'Serie';
}

// Marks the item as being watched now, keeping whatever progress was already
// recorded. Called when the player opens a stream.
export function recordPlayback(playlistId, entry) {
  if (!playlistId || !entry || entry.id === undefined || entry.id === null) return;
  const key = entryKey(playlistId, entry.kind, entry.id);
  const now = Date.now();
  const existing = readLibrary().history[key];
  const carried = existing && !existing.deletedAt ? existing : null;
  updateLibrary((draft) => {
    draft.history[key] = {
      position: 0,
      duration: 0,
      completed: false,
      ...carried,
      ...entry,
      playlistId,
      watchedAt: now,
      updatedAt: now,
      deletedAt: undefined,
    };
  });
}

// Called periodically by the player. Writes are skipped when the rounded
// position has not moved, so idle/paused playback does not churn localStorage.
export function saveProgress(playlistId, kind, id, position, duration) {
  if (!playlistId || id === undefined || id === null) return;
  if (kind === 'live') return;
  const seconds = Math.floor(Number(position) || 0);
  const total = Math.floor(Number(duration) || 0);
  if (!Number.isFinite(seconds) || seconds < 0) return;

  const key = entryKey(playlistId, kind, id);
  const existing = readLibrary().history[key];
  if (!existing || existing.deletedAt) return;
  if (existing.position === seconds && existing.duration === total) return;

  const now = Date.now();
  const next = { ...existing, position: seconds, duration: total, updatedAt: now, watchedAt: now };
  next.completed = isCompleted(next);
  updateLibrary((draft) => {
    draft.history[key] = next;
  });
}

export function markCompleted(playlistId, kind, id) {
  if (!playlistId || id === undefined || id === null) return;
  const key = entryKey(playlistId, kind, id);
  const existing = readLibrary().history[key];
  if (!existing || existing.deletedAt) return;
  const now = Date.now();
  updateLibrary((draft) => {
    draft.history[key] = { ...existing, completed: true, updatedAt: now, watchedAt: now };
  });
}

export function removeHistoryEntry(playlistId, kind, id) {
  const key = entryKey(playlistId, kind, id);
  const now = Date.now();
  updateLibrary((draft) => {
    draft.history[key] = { playlistId, kind, id, deletedAt: now, updatedAt: now };
  });
}

export function clearHistory(playlistId) {
  const now = Date.now();
  const doc = readLibrary();
  updateLibrary((draft) => {
    for (const [key, entry] of Object.entries(doc.history)) {
      if (entry.deletedAt || entry.playlistId !== playlistId) continue;
      draft.history[key] = {
        playlistId,
        kind: entry.kind,
        id: entry.id,
        deletedAt: now,
        updatedAt: now,
      };
    }
  });
}

// Everything watched on this playlist, most recent first.
export function useHistory(playlistId) {
  const library = useLibrary();
  return useMemo(() => {
    if (!playlistId) return EMPTY;
    return liveEntries(library.history)
      .filter((entry) => entry.playlistId === playlistId)
      .sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0));
  }, [library, playlistId]);
}

// Unfinished items, one row per series (the most recently watched episode).
export function useContinueWatching(playlistId) {
  const history = useHistory(playlistId);
  return useMemo(() => {
    const seenSeries = new Set();
    const out = [];
    for (const entry of history) {
      if (entry.kind === 'live' || isCompleted(entry)) continue;
      if (entry.kind === 'series') {
        const groupId = entry.seriesId ?? entry.id;
        if (seenSeries.has(groupId)) continue;
        seenSeries.add(groupId);
      } else if (!(entry.position > MIN_RESUME_SECONDS)) {
        // A movie barely started is noise; a series episode is not, since
        // opening one is already a deliberate "I'm watching this" signal.
        continue;
      }
      out.push(entry);
      if (out.length >= MAX_CONTINUE_ITEMS) break;
    }
    return out;
  }, [history]);
}

// "kind:id" -> entry, for decorating grids and episode lists with progress.
export function useHistoryMap(playlistId) {
  const history = useHistory(playlistId);
  return useMemo(() => {
    const map = new Map();
    history.forEach((entry) => map.set(`${entry.kind}:${entry.id}`, entry));
    return map;
  }, [history]);
}

// Non-reactive read, for the places that need the value as it was at a
// specific moment rather than a live subscription.
export function readHistoryEntry(playlistId, kind, id) {
  if (!playlistId || id === undefined || id === null) return null;
  const entry = readLibrary().history[entryKey(playlistId, kind, id)];
  return entry && !entry.deletedAt ? entry : null;
}

export function useHistoryEntry(playlistId, kind, id) {
  const library = useLibrary();
  return useMemo(() => {
    if (!playlistId || id === undefined || id === null) return null;
    const entry = library.history[entryKey(playlistId, kind, id)];
    return entry && !entry.deletedAt ? entry : null;
  }, [library, playlistId, kind, id]);
}

// Most recent unfinished episode of a series, for a "continue from" button.
export function useSeriesProgress(playlistId, seriesId) {
  const history = useHistory(playlistId);
  return useMemo(() => {
    if (!seriesId) return null;
    const episodes = history.filter(
      (entry) => entry.kind === 'series' && String(entry.seriesId) === String(seriesId)
    );
    if (episodes.length === 0) return null;
    return { last: episodes[0], watched: new Map(episodes.map((e) => [String(e.id), e])) };
  }, [history, seriesId]);
}
