'use client';

import { useSyncExternalStore } from 'react';

// Playlists (Xtream credentials) are kept in localStorage only - this is a
// personal single-user client, there is no backend account/database.
// Reads go through useSyncExternalStore (React's sanctioned way to subscribe
// to state that lives outside React, such as localStorage) so components
// always see a consistent snapshot without manually syncing state in effects.

const STORAGE_KEY = 'iptv.playlists.v1';
const EMPTY = [];
const listeners = new Set();

let cachedRaw;
let cachedList = EMPTY;

function readRaw() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
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

function getSnapshot() {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = parseList(raw);
  }
  return cachedList;
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

function persist(list) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  cachedRaw = undefined;
  listeners.forEach((callback) => callback());
}

export function useLocalPlaylists() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function usePlaylist(id) {
  const playlists = useLocalPlaylists();
  return playlists.find((p) => p.id === id) || null;
}

export function addPlaylist(playlist) {
  const next = [...getSnapshot(), playlist];
  persist(next);
  return next;
}

export function removePlaylist(id) {
  const next = getSnapshot().filter((p) => p.id !== id);
  persist(next);
  return next;
}

export function makePlaylistId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `pl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
