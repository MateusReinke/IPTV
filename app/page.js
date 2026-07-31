'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addPlaylist, makePlaylistId, removePlaylist, useLocalPlaylists } from '@/lib/playlists';
import { xtreamRequest } from '@/lib/xtream';
import PlaylistCard from '@/components/PlaylistCard';
import PlaylistForm from '@/components/PlaylistForm';
import Button from '@/components/Button';
import styles from './page.module.css';

export default function PlaylistsPage() {
  const router = useRouter();
  const playlists = useLocalPlaylists();
  const [formOpen, setFormOpen] = useState(false);
  const showForm = formOpen || playlists.length === 0;

  async function handleAdd(values) {
    const data = await xtreamRequest(values, undefined);
    const authOk = data?.user_info && (data.user_info.auth === 1 || data.user_info.auth === '1');
    if (!authOk) {
      throw new Error(
        data?.user_info?.message || 'Usuario ou senha invalidos para este servidor'
      );
    }

    const playlist = { id: makePlaylistId(), ...values };
    addPlaylist(playlist);
    router.push(`/playlist/${playlist.id}`);
  }

  function handleRemove(id, title) {
    if (typeof window !== 'undefined' && !window.confirm(`Remover a playlist "${title}"?`)) {
      return;
    }
    removePlaylist(id);
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.logo} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="2.5" y="5" width="19" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8 21h8M7 2 12 5l5-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className={styles.headerText}>
            <h1 className={styles.title}>IPTV Player</h1>
            <p className={styles.subtitle}>Conecte-se a um servidor Xtream Codes para assistir</p>
          </div>
        </div>

        {playlists.length > 0 && (
          <div className={styles.list}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionTitle}>Suas playlists</span>
              {!showForm && (
                <Button variant="ghost" onClick={() => setFormOpen(true)}>
                  + Adicionar playlist
                </Button>
              )}
            </div>
            {playlists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                onOpen={() => router.push(`/playlist/${playlist.id}`)}
                onRemove={() => handleRemove(playlist.id, playlist.title)}
              />
            ))}
          </div>
        )}

        {showForm && (
          <div className={styles.formCard}>
            <p className={styles.formTitle}>Adicionar playlist: xtream</p>
            <PlaylistForm
              onSubmit={handleAdd}
              onCancel={playlists.length > 0 ? () => setFormOpen(false) : undefined}
            />
          </div>
        )}
      </div>
    </main>
  );
}
