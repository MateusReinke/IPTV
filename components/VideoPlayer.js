'use client';

import { useEffect, useRef, useState } from 'react';
import Spinner from './Spinner';
import Button from './Button';
import styles from './VideoPlayer.module.css';

export default function VideoPlayer({ src, isHls, onEnded }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  // Kept in a ref so the setup effect below doesn't need to depend on it -
  // depending on it directly would tear down and reattach hls.js (restarting
  // playback) on every parent re-render that passes a new closure.
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    let cancelled = false;
    let hls;

    setStatus('loading');
    setErrorMessage('');

    function handleCanPlay() {
      if (!cancelled) setStatus('ready');
    }

    function handleVideoError() {
      if (cancelled) return;
      setStatus('error');
      setErrorMessage('Nao foi possivel reproduzir este conteudo.');
    }

    function handleEnded() {
      onEndedRef.current?.();
    }

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleVideoError);
    video.addEventListener('ended', handleEnded);

    async function setup() {
      if (isHls) {
        const canPlayNative = video.canPlayType('application/vnd.apple.mpegurl');
        if (canPlayNative) {
          video.src = src;
          return;
        }
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setStatus('error');
          setErrorMessage('Seu navegador nao suporta reproducao deste formato.');
          return;
        }
        hls = new Hls({ maxBufferLength: 30 });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (cancelled || !data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setStatus('error');
            setErrorMessage('Falha ao carregar o stream.');
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } else {
        video.src = src;
      }
    }

    setup();

    return () => {
      cancelled = true;
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleVideoError);
      video.removeEventListener('ended', handleEnded);
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, isHls, retryKey]);

  return (
    <div className={styles.wrap}>
      <video ref={videoRef} className={styles.video} controls autoPlay playsInline />
      {status === 'loading' && (
        <div className={styles.overlay}>
          <Spinner size={32} />
        </div>
      )}
      {status === 'error' && (
        <div className={styles.overlay}>
          <p className={styles.errorText}>{errorMessage}</p>
          <Button variant="secondary" onClick={() => setRetryKey((k) => k + 1)}>
            Tentar novamente
          </Button>
        </div>
      )}
    </div>
  );
}
