'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { downloadBackup, importBackupFile } from '@/lib/backup';
import { syncNow, useSyncState } from '@/lib/sync';
import { useEntitlements } from './SessionProvider';
import Button from './Button';
import styles from './SyncPanel.module.css';

const STATUS_LABEL = {
  idle: 'Aguardando',
  syncing: 'Sincronizando...',
  ok: 'Tudo sincronizado',
  error: 'Falha na sincronizacao',
  blocked: 'Somente no Premium',
};

export default function SyncPanel() {
  const sync = useSyncState();
  const entitlements = useEntitlements();
  const canSync = !!entitlements?.features?.sync;
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const added = await importBackupFile(file);
      setMessage({
        tone: 'success',
        text: `Backup importado: +${added.playlists} playlist(s), +${added.favorites} favorito(s), +${added.history} item(ns) de historico.`,
      });
    } catch (err) {
      setMessage({ tone: 'error', text: err?.message || 'Nao foi possivel importar o arquivo' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Backup e sincronizacao</h2>
          <p className={styles.subtitle}>
            {canSync
              ? 'Suas playlists, favoritos e historico ficam guardados na sua conta e acompanham voce em qualquer aparelho.'
              : 'No plano atual seus dados ficam apenas neste navegador. Exporte um arquivo para nao perde-los, ou assine o Premium para sincronizar automaticamente.'}
          </p>
        </div>
        <span className={`${styles.badge} ${styles[`badge_${sync.status}`] || ''}`}>
          {STATUS_LABEL[sync.status] || STATUS_LABEL.idle}
        </span>
      </div>

      {canSync ? (
        <div className={styles.block}>
          <p className={styles.meta}>
            {sync.lastSyncAt
              ? `Ultima sincronizacao: ${new Date(sync.lastSyncAt).toLocaleString('pt-BR')}`
              : 'Sincronizando pela primeira vez neste aparelho...'}
          </p>
          {sync.status === 'error' && sync.error && <p className={styles.error}>{sync.error}</p>}
          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => syncNow()}
              loading={sync.status === 'syncing'}
            >
              Sincronizar agora
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.block}>
          <p className={styles.notice}>
            A sincronizacao entre aparelhos e o historico do que voce assistiu fazem parte do
            Premium.{' '}
            <Link className={styles.inlineLink} href="/app/conta">
              Ver planos
            </Link>
          </p>
        </div>
      )}

      <div className={styles.divider} />

      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => downloadBackup()}>
          Exportar backup
        </Button>
        <Button variant="ghost" onClick={() => fileInputRef.current?.click()} loading={busy}>
          Importar backup
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className={styles.fileInput}
          onChange={handleImport}
        />
      </div>

      {message && (
        <p className={message.tone === 'error' ? styles.error : styles.info}>{message.text}</p>
      )}
    </section>
  );
}
