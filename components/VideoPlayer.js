'use client';

import { useEffect, useRef, useState } from 'react';
import Spinner from './Spinner';
import Button from './Button';
import styles from './VideoPlayer.module.css';

// Containers with essentially no native <video> support in mainstream browsers
// (no demuxer at all, regardless of the codec inside) - failing fast on these
// avoids a confusing silent black screen.
const UNSUPPORTED_CONTAINERS = new Set(['mkv', 'avi', 'wmv', 'flv']);

const UNSUPPORTED_CONTAINER_MESSAGE = (ext) =>
  `Este arquivo esta no formato .${ext.toUpperCase()}, que a maioria dos navegadores nao consegue reproduzir diretamente (isso nao e algo que o app consiga contornar). Tente abrir o link abaixo em um player como o VLC.`;

const BLACK_FRAME_MESSAGE =
  'O audio esta tocando mas a imagem nao aparece. Isso normalmente acontece quando o video usa um codec que o seu navegador nao suporta (ex: HEVC/H.265). Tente outro navegador (o Safari costuma suportar mais formatos) ou abra o link abaixo em um player como o VLC.';

export default function VideoPlayer({ src, isHls, ext, onEnded }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [offerExternalLink, setOfferExternalLink] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Kept in a ref so the setup effect below doesn't need to depend on it -
  // depending on it directly would tear down and reattach hls.js (restarting
  // playback) on every parent re-render that passes a new closure.
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const containerExt = (ext || '').toLowerCase().replace(/^\./, '');
  const unsupportedContainer = !isHls && UNSUPPORTED_CONTAINERS.has(containerExt);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || unsupportedContainer) return undefined;

    let cancelled = false;
    let hls;
    let blackFrameTimer;

    setStatus('loading');
    setErrorMessage('');
    setOfferExternalLink(false);

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

    // Some codecs (notably HEVC/H.265 in a browser without HW/SW decode
    // support) let audio play fine while the video track never renders a
    // frame - no `error` event fires because, from the browser's point of
    // view, playback "succeeded". Catch that by checking for real pixels
    // once playback is under way.
    function handlePlaying() {
      if (cancelled) return;
      clearTimeout(blackFrameTimer);
      blackFrameTimer = setTimeout(() => {
        if (cancelled || video.paused || video.ended) return;
        if (video.videoWidth === 0) {
          setStatus('error');
          setErrorMessage(BLACK_FRAME_MESSAGE);
          setOfferExternalLink(true);
        }
      }, 3000);
    }

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleVideoError);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('playing', handlePlaying);

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
      clearTimeout(blackFrameTimer);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleVideoError);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('playing', handlePlaying);
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, isHls, ext, unsupportedContainer, retryKey]);

  const displayStatus = unsupportedContainer ? 'error' : status;
  const displayMessage = unsupportedContainer
    ? UNSUPPORTED_CONTAINER_MESSAGE(containerExt)
    : errorMessage;
  const displayOfferLink = unsupportedContainer || offerExternalLink;

  return (
    <div className={styles.wrap}>
      <video ref={videoRef} className={styles.video} controls autoPlay playsInline />
      {displayStatus === 'loading' && (
        <div className={styles.overlay}>
          <Spinner size={32} />
        </div>
      )}
      {displayStatus === 'error' && (
        <div className={styles.overlay}>
          <p className={styles.errorText}>{displayMessage}</p>
          <div className={styles.errorActions}>
            {!unsupportedContainer && (
              <Button variant="secondary" onClick={() => setRetryKey((k) => k + 1)}>
                Tentar novamente
              </Button>
            )}
            {displayOfferLink && (
              <a
                className={styles.externalLink}
                href={src}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir link do stream
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
