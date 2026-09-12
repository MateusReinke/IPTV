'use client';

import VideoPlayer from './VideoPlayer';
import { usePlaybackSlot } from './PlaybackProvider';
import UpgradeNotice from './UpgradeNotice';
import styles from './MultiviewTile.module.css';

// One picture in the grid. Each tile holds its own server-side lease, so a
// plan that allows fewer screens simply refuses the extra tiles - the paywall
// shows up exactly where the user tried to cross it.

export default function MultiviewTile({
  id,
  index,
  playlist,
  channel,
  hasAudio,
  onRequestAudio,
  onPick,
  onRemove,
}) {
  const target = channel
    ? {
        server: playlist.server,
        username: playlist.username,
        password: playlist.password,
        kind: 'live',
        streamId: channel.id,
        ext: 'm3u8',
      }
    : null;
  const { src, tokenRef, error, retry } = usePlaybackSlot(id, channel?.name, target, !!channel);

  if (!channel) {
    return (
      <button type="button" className={styles.empty} onClick={onPick}>
        <span className={styles.plus} aria-hidden="true">
          +
        </span>
        <span className={styles.emptyLabel}>Escolher canal</span>
        <span className={styles.emptyHint}>Tela {index + 1}</span>
      </button>
    );
  }

  if (error) {
    return (
      <div className={styles.tile}>
        <div className={styles.locked}>
          <UpgradeNotice
            compact
            title={error.code === 'SCREEN_LIMIT' ? 'Tela extra bloqueada' : 'Falha ao iniciar'}
            message={error.message}
            showUpgrade={error.code === 'SCREEN_LIMIT'}
            onRetry={retry}
          />
        </div>
        <TileBar
          channel={channel}
          hasAudio={false}
          onRequestAudio={onRequestAudio}
          onPick={onPick}
          onRemove={onRemove}
          index={index}
          muteDisabled
        />
      </div>
    );
  }

  return (
    <div
      className={`${styles.tile} ${hasAudio ? styles.tileActive : ''}`}
      role="group"
      aria-label={channel.name}
    >
      <div
        className={styles.video}
        role="button"
        tabIndex={0}
        onClick={onRequestAudio}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onRequestAudio();
          }
        }}
        aria-label={hasAudio ? `${channel.name} com audio` : `Ouvir ${channel.name}`}
      >
        {src ? (
          <VideoPlayer
            key={`${id}:${channel.id}`}
            src={src}
            isHls
            ext="m3u8"
            tokenRef={tokenRef}
            muted={!hasAudio}
            controls={false}
            className={styles.player}
          />
        ) : (
          <div className={styles.loading} />
        )}
      </div>

      <TileBar
        channel={channel}
        hasAudio={hasAudio}
        onRequestAudio={onRequestAudio}
        onPick={onPick}
        onRemove={onRemove}
        index={index}
      />
    </div>
  );
}

function TileBar({ channel, hasAudio, onRequestAudio, onPick, onRemove, index, muteDisabled }) {
  return (
    <div className={styles.bar}>
      <span className={styles.number}>{index + 1}</span>
      <span className={styles.title}>{channel.name}</span>
      <button
        type="button"
        className={`${styles.action} ${hasAudio ? styles.actionActive : ''}`}
        onClick={onRequestAudio}
        disabled={muteDisabled}
        aria-label={hasAudio ? 'Audio nesta tela' : 'Trazer o audio para esta tela'}
        aria-pressed={hasAudio}
        title={hasAudio ? 'Audio nesta tela' : 'Ouvir esta tela'}
      >
        {hasAudio ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
      </button>
      <button type="button" className={styles.action} onClick={onPick} aria-label="Trocar canal" title="Trocar canal">
        <SwapIcon />
      </button>
      <button type="button" className={styles.action} onClick={onRemove} aria-label="Fechar tela" title="Fechar tela">
        <CloseIcon />
      </button>
    </div>
  );
}

function SpeakerOnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" />
      <path d="M17 9.5l4 5M21 9.5l-4 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8h13l-3-3M20 16H7l3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
