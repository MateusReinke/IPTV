'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocalPlaylists } from '@/lib/playlists';
import { useHydrated } from '@/lib/library';
import { LAYOUTS } from '@/lib/entitlements';
import { tileId, useMultiview } from '@/lib/multiview';
import { useEntitlements } from '@/components/SessionProvider';
import MultiviewTile from '@/components/MultiviewTile';
import ChannelPicker from '@/components/ChannelPicker';
import Button from '@/components/Button';
import { EmptyState, LoadingState } from '@/components/StateMessage';
import styles from './page.module.css';

// The paid differentiator: several live channels at once, with one of them
// carrying the audio. Everything about *how many* is decided by the server
// (each tile leases a slot), so this page only has to make the choice obvious.

export default function MultiviewPage() {
  const playlists = useLocalPlaylists();
  const hydrated = useHydrated();
  const entitlements = useEntitlements();
  const screens = entitlements?.features?.screens || 1;

  const [playlistId, setPlaylistId] = useState(null);
  const activePlaylist = playlists.find((p) => p.id === playlistId) || playlists[0] || null;

  const { layout, tiles, audioTile, setLayout, setChannel, setAudioTile, clearAll } = useMultiview(
    activePlaylist?.id,
    screens
  );

  const [picking, setPicking] = useState(null);
  const gridRef = useRef(null);

  const chooseAudio = useCallback(
    (id) => {
      setAudioTile(id);
    },
    [setAudioTile]
  );

  // Number keys move the audio between tiles - the fastest control when you
  // are following several matches at once.
  useEffect(() => {
    function onKey(event) {
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
      const digit = Number(event.key);
      if (!digit || digit < 1 || digit > layout.tiles) return;
      const id = tileId(digit - 1);
      if (tiles[id]) chooseAudio(id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chooseAudio, layout.tiles, tiles]);

  function toggleFullscreen() {
    const element = gridRef.current;
    if (!element) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else element.requestFullscreen?.();
  }

  if (!hydrated) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando..." />
      </main>
    );
  }

  if (playlists.length === 0) {
    return (
      <main className={styles.page}>
        <EmptyState message="Adicione uma playlist para usar a multitela." />
        <div className={styles.centerAction}>
          <Link href="/app">
            <Button variant="primary">Adicionar playlist</Button>
          </Link>
        </div>
      </main>
    );
  }

  const filledTiles = Object.keys(tiles).filter((id) =>
    Array.from({ length: layout.tiles }, (_, i) => tileId(i)).includes(id)
  ).length;

  return (
    <main className={styles.page}>
      <header className={styles.toolbar}>
        <div className={styles.group}>
          {playlists.length > 1 && (
            <select
              className={styles.select}
              value={activePlaylist?.id || ''}
              onChange={(event) => setPlaylistId(event.target.value)}
              aria-label="Playlist"
            >
              {playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.title}
                </option>
              ))}
            </select>
          )}

          <div className={styles.layouts} role="group" aria-label="Quantidade de telas">
            {LAYOUTS.map((option) => {
              const locked = option.tiles > screens;
              const active = option.id === layout.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.layoutBtn} ${active ? styles.layoutActive : ''} ${
                    locked ? styles.layoutLocked : ''
                  }`}
                  onClick={() => (locked ? null : setLayout(option.id))}
                  title={
                    locked
                      ? `${option.label} faz parte do Premium`
                      : option.label
                  }
                  aria-pressed={active}
                >
                  {option.tiles}
                  {locked && <LockIcon />}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.group}>
          <span className={styles.hint}>
            {filledTiles > 0
              ? 'Clique em uma tela (ou tecle 1-9) para ouvir o audio dela'
              : 'Escolha um canal para cada tela'}
          </span>
          {filledTiles > 0 && (
            <Button variant="ghost" onClick={clearAll}>
              Limpar
            </Button>
          )}
          <Button variant="secondary" onClick={toggleFullscreen}>
            Tela cheia
          </Button>
        </div>
      </header>

      {screens < 2 && (
        <div className={styles.upsell}>
          <strong>Multitela e um recurso Premium.</strong> No plano atual voce assiste a uma tela por
          vez.{' '}
          <Link className={styles.upsellLink} href="/app/conta">
            Ver planos
          </Link>
        </div>
      )}

      <div
        ref={gridRef}
        className={styles.grid}
        style={{ '--columns': layout.columns, '--rows': Math.ceil(layout.tiles / layout.columns) }}
      >
        {Array.from({ length: layout.tiles }, (_, index) => {
          const id = tileId(index);
          return (
            <MultiviewTile
              key={id}
              id={id}
              index={index}
              playlist={activePlaylist}
              channel={tiles[id] || null}
              hasAudio={audioTile === id}
              onRequestAudio={() => chooseAudio(id)}
              onPick={() => setPicking(id)}
              onRemove={() => setChannel(id, null)}
            />
          );
        })}
      </div>

      <ChannelPicker
        playlist={activePlaylist}
        open={!!picking}
        onClose={() => setPicking(null)}
        onPick={(channel) => {
          setChannel(picking, channel);
          setPicking(null);
        }}
      />
    </main>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 10V7a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" fill="currentColor" />
    </svg>
  );
}
