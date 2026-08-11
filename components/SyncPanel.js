'use client';

import { useEffect, useRef, useState } from 'react';
import { downloadBackup, importBackupFile } from '@/lib/backup';
import {
  connectSyncAccount,
  createSyncAccount,
  disconnectSync,
  formatSyncCode,
  serverSyncAvailable,
  setIncludePlaylists,
  syncAvailableInBrowser,
  syncNow,
  useSyncState,
} from '@/lib/sync';
import Button from './Button';
import styles from './SyncPanel.module.css';

const STATUS_LABEL = {
  idle: 'Aguardando',
  syncing: 'Sincronizando...',
  ok: 'Tudo sincronizado',
  error: 'Falha na sincronizacao',
};

export default function SyncPanel() {
  const sync = useSyncState();
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState('idle'); // idle | creating | connecting | created
  const [codeInput, setCodeInput] = useState('');
  const [newCode, setNewCode] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [server, setServer] = useState(null);

  const connected = !!sync.code;

  useEffect(() => {
    let active = true;
    serverSyncAvailable().then((result) => {
      if (active) setServer(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const browserOk = syncAvailableInBrowser();
  const serverOk = server?.available !== false;
  const canSync = browserOk && serverOk;

  function report(text, tone = 'info') {
    setMessage({ text, tone });
  }

  async function handleCreate() {
    setBusy(true);
    setMessage(null);
    try {
      const code = await createSyncAccount({ includePlaylists: sync.includePlaylists });
      setNewCode(code);
      setMode('created');
    } catch (err) {
      report(err?.message || 'Nao foi possivel criar o codigo', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleConnect(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await connectSyncAccount(codeInput, { includePlaylists: sync.includePlaylists });
      setCodeInput('');
      setMode('idle');
      report('Dispositivo conectado. Seus dados foram mesclados.', 'success');
    } catch (err) {
      report(err?.message || 'Nao foi possivel conectar', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Desconectar este dispositivo da sincronizacao? Os dados continuam salvos aqui e no servidor.'
      )
    ) {
      return;
    }
    await disconnectSync();
    setNewCode('');
    setMode('idle');
    report('Dispositivo desconectado.', 'info');
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const added = await importBackupFile(file);
      report(
        `Backup importado: +${added.playlists} playlist(s), +${added.favorites} favorito(s), +${added.history} item(ns) de historico.`,
        'success'
      );
    } catch (err) {
      report(err?.message || 'Nao foi possivel importar o arquivo', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(code) {
    try {
      await navigator.clipboard.writeText(code);
      report('Codigo copiado.', 'success');
    } catch {
      report('Copie o codigo manualmente.', 'info');
    }
  }

  // Avoids rendering a "not connected" state before localStorage is read.
  if (!sync.ready) return null;

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Backup e sincronizacao</h2>
          <p className={styles.subtitle}>
            Favoritos e historico ficam salvos neste navegador. Para nao perder nada ao limpar os
            dados, trocar de aparelho ou usar a TV, exporte um arquivo de backup ou ative a
            sincronizacao.
          </p>
        </div>
        {connected && (
          <span className={`${styles.badge} ${styles[`badge_${sync.status}`] || ''}`}>
            {STATUS_LABEL[sync.status] || STATUS_LABEL.idle}
          </span>
        )}
      </div>

      {/* Creating an account connects this device immediately, so the freshly
          generated code gets its own step - it is the only copy that exists. */}
      {mode === 'created' && newCode ? (
        <div className={styles.codeCard}>
          <p className={styles.codeCardTitle}>Guarde este codigo</p>
          <code className={styles.codeBig}>{newCode}</code>
          <p className={styles.codeCardHint}>
            Ele e a unica chave dos seus dados: digite-o nos outros aparelhos para sincronizar. Se
            voce perde-lo, nao ha como recuperar o que foi enviado.
          </p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => handleCopy(newCode)}>
              Copiar codigo
            </Button>
            <Button variant="ghost" onClick={() => setMode('idle')}>
              Ja anotei
            </Button>
          </div>
        </div>
      ) : connected ? (
        <div className={styles.block}>
          <div className={styles.codeRow}>
            <span className={styles.codeLabel}>Seu codigo</span>
            <code className={styles.code}>
              {revealed ? formatSyncCode(sync.code) : '•••••-•••••-•••••-•••••'}
            </code>
            <button type="button" className={styles.link} onClick={() => setRevealed((v) => !v)}>
              {revealed ? 'Ocultar' : 'Mostrar'}
            </button>
            <button
              type="button"
              className={styles.link}
              onClick={() => handleCopy(formatSyncCode(sync.code))}
            >
              Copiar
            </button>
          </div>

          <p className={styles.meta}>
            {sync.lastSyncAt
              ? `Ultima sincronizacao: ${new Date(sync.lastSyncAt).toLocaleString('pt-BR')}`
              : 'Ainda nao sincronizado neste dispositivo.'}
          </p>
          {sync.status === 'error' && sync.error && <p className={styles.error}>{sync.error}</p>}

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={sync.includePlaylists}
              onChange={(e) => setIncludePlaylists(e.target.checked)}
            />
            <span>
              Sincronizar tambem as playlists (usuario e senha do provedor). Tudo e criptografado no
              navegador antes de subir, mas quem tiver o codigo consegue abrir.
            </span>
          </label>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => syncNow()} loading={sync.status === 'syncing'}>
              Sincronizar agora
            </Button>
            <Button variant="ghost" onClick={handleDisconnect}>
              Desconectar
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.block}>
          {!canSync && (
            <p className={styles.notice}>
              {!browserOk
                ? 'A sincronizacao entre dispositivos precisa de https:// (ou localhost). Enquanto isso, use o backup em arquivo.'
                : 'Este servidor nao tem armazenamento configurado para sincronizacao (defina IPTV_DATA_DIR). O backup em arquivo funciona normalmente.'}
            </p>
          )}

          {mode === 'connecting' && (
            <form className={styles.form} onSubmit={handleConnect}>
              <label className={styles.fieldLabel} htmlFor="sync-code">
                Codigo de sincronizacao
              </label>
              <div className={styles.formRow}>
                <input
                  id="sync-code"
                  className={styles.input}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button type="submit" variant="primary" loading={busy}>
                  Conectar
                </Button>
                <Button type="button" variant="ghost" onClick={() => setMode('idle')}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}

          {mode !== 'connecting' && (
            <div className={styles.actions}>
              <Button variant="secondary" onClick={handleCreate} loading={busy} disabled={!canSync}>
                Criar codigo de sincronizacao
              </Button>
              <Button variant="ghost" onClick={() => setMode('connecting')} disabled={!canSync}>
                Ja tenho um codigo
              </Button>
            </div>
          )}
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
