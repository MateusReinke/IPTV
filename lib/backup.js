'use client';

import { liveEntries, mergeLibraries, readLibrary, replaceLibrary } from './library';
import { APP_NAME } from './pricing';

// File backup: the zero-infrastructure way to keep favorites and history.
// Exports the whole library document as JSON and merges it back on import
// (same last-write-wins rules as sync, so importing an old file never
// resurrects entries deleted afterwards).

// Kept as-is regardless of the product's display name: it's written into
// every exported file, and changing it would make older backups unreadable.
const FILE_KIND = 'iptv-player-library';

export function backupFileName() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `iptv-backup-${stamp}.json`;
}

export function buildBackup({ includePlaylists = true } = {}) {
  const library = readLibrary();
  return {
    kind: FILE_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    library: includePlaylists ? library : { ...library, playlists: {} },
  };
}

export function downloadBackup(options) {
  const blob = new Blob([JSON.stringify(buildBackup(options), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function importBackupFile(file) {
  if (!file) throw new Error('Nenhum arquivo selecionado');

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Arquivo invalido: nao e um JSON valido');
  }

  const incoming = parsed?.library;
  if (!parsed || parsed.kind !== FILE_KIND || !incoming || typeof incoming !== 'object') {
    throw new Error(`Este arquivo nao e um backup do ${APP_NAME}`);
  }

  const before = readLibrary();
  const merged = mergeLibraries(before, incoming);
  replaceLibrary(merged);

  return {
    playlists: liveEntries(merged.playlists).length - liveEntries(before.playlists).length,
    favorites: liveEntries(merged.favorites).length - liveEntries(before.favorites).length,
    history: liveEntries(merged.history).length - liveEntries(before.history).length,
  };
}
