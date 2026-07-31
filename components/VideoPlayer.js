'use client';

import { useEffect, useRef, useState } from 'react';
import Spinner from './Spinner';
import Button from './Button';
import styles from './VideoPlayer.module.css';

export default function VideoPlayer({ src, isHls }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);

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

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleVideoError);

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
