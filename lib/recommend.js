// Shared logic for the AI pick: how a genre is named, which titles are worth
// showing the recommender, and what the account's taste looks like.
//
// Kept import-free so both sides can use it: the browser builds the payload
// with these helpers, and the route handler re-runs the same clamps on what
// arrives (a client can send anything, and all of it ends up inside a prompt).

import { normalize } from './text';

// What the recommender is allowed to look at. Small on purpose: a bigger
// catalog dump costs tokens without making the pick better, and the whole
// call has to finish while someone is staring at a spinner.
export const LIMITS = {
  candidates: 40,
  recent: 25,
  favorites: 15,
  topGenres: 5,
  name: 120,
  genre: 60,
  reason: 600,
  alternates: 2,
};

// Category names in Xtream panels are folder paths, not genres:
// "FILMES | ACAO", "VOD > Comedia", "FILMES - LANCAMENTOS". The genre is the
// last segment; the leading one is just where the provider filed it.
const CATEGORY_SEPARATORS = /[|›»>]/;
const GENERIC_SEGMENTS = new Set([
  'filme',
  'filmes',
  'movie',
  'movies',
  'vod',
  'cinema',
  'canais',
  'canal',
  'series',
  'serie',
]);

export function genreLabel(categoryName) {
  const raw = String(categoryName || '').trim();
  if (!raw) return '';
  let parts = raw.split(CATEGORY_SEPARATORS).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && GENERIC_SEGMENTS.has(normalize(parts[0]))) {
    parts = parts.slice(1);
  }
  const label = parts.join(' · ').slice(0, LIMITS.genre);
  // Providers shout their categories. Title case reads better in a chip, but
  // only when there is no casing to preserve in the first place.
  return /[a-z]/.test(label) ? label : titleCase(label);
}

function titleCase(value) {
  return value.replace(/\p{L}[\p{L}'’-]*/gu, (word) =>
    word.length <= 2 && word === word.toUpperCase()
      ? word
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

export function ratingOf(item) {
  const rating = Number(item?.rating);
  return Number.isFinite(rating) && rating > 0 ? Math.min(10, rating) : 0;
}

function clampText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

// One catalog entry as the recommender sees it. `image`/`ext` ride along so
// the answer can be played without a second catalog lookup.
export function toCandidate(item, genre) {
  const id = String(item?.stream_id ?? item?.series_id ?? '').trim();
  const name = clampText(item?.name, LIMITS.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    genre: clampText(genre, LIMITS.genre),
    rating: ratingOf(item),
    image: String(item?.stream_icon || item?.cover || ''),
    ext: String(item?.container_extension || 'mp4'),
  };
}

// Picks which titles to send. Sorting purely by rating would hand the model
// the same 40 blockbusters on every call, so the score carries a jitter wide
// enough to reshuffle neighbours while still favouring what is well rated.
export function selectCandidates(items, { genreOf = () => '', exclude = new Set(), limit = LIMITS.candidates } = {}) {
  const pool = [];
  for (const item of items || []) {
    const candidate = toCandidate(item, genreOf(item));
    if (!candidate || exclude.has(candidate.id)) continue;
    pool.push(candidate);
  }
  return pool
    .map((candidate) => ({
      candidate,
      // Unrated titles sit mid-table rather than last: a missing rating in an
      // Xtream panel usually means nobody filled the field in.
      score: (candidate.rating || 5) + Math.random() * 4,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

// What the account has been watching, in the shape the prompt expects.
// `genreById` maps a catalog id to its genre, so history (which only stores
// what was played) can be described in terms of taste.
export function buildProfile({ history = [], favorites = [], genreById = new Map() } = {}) {
  const counts = new Map();
  const recent = [];

  for (const entry of history) {
    if (entry.kind === 'live') continue;
    const genre = genreById.get(`${entry.kind}:${entry.id}`) || '';
    if (genre) counts.set(genre, (counts.get(genre) || 0) + 2);
    if (recent.length < LIMITS.recent) {
      recent.push({
        name: clampText(entry.seriesName || entry.name, LIMITS.name),
        genre: clampText(genre, LIMITS.genre),
        kind: entry.kind === 'series' ? 'series' : 'movie',
        finished: !!entry.completed,
      });
    }
  }

  const favoriteNames = [];
  for (const favorite of favorites) {
    if (favorite.kind === 'live') continue;
    const genre = genreById.get(`${favorite.kind}:${favorite.id}`) || '';
    // A favourite is a stronger signal than a play: someone finished the
    // film and then went back to mark it.
    if (genre) counts.set(genre, (counts.get(genre) || 0) + 3);
    if (favoriteNames.length < LIMITS.favorites) {
      favoriteNames.push(clampText(favorite.name, LIMITS.name));
    }
  }

  const topGenres = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMITS.topGenres)
    .map(([genre, weight]) => ({ genre, weight }));

  return { topGenres, recent, favorites: favoriteNames.filter(Boolean) };
}

export function profileIsThin(profile) {
  return (profile?.recent?.length || 0) + (profile?.favorites?.length || 0) < 3;
}
