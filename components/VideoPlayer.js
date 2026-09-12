'use client';

import { useEffect, useRef, useState } from 'react';
import { withPlayToken } from '@/lib/xtream';
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

const CODEC_UNSUPPORTED_MESSAGE =
  'Seu navegador nao consegue decodificar o video deste canal/conteudo (codec nao suportado, comum em canais 4K/HEVC). Tente outro navegador (o Safari costuma suportar mais formatos) ou abra o link abaixo em um player como o VLC.';

// hls.js's own fatal-error recovery (recoverMediaError/startLoad) is meant for
// transient glitches. Some fatal errors - an unsupported codec chief among
// them - can never actually be recovered that way: retrying just repeats the
// identical failure forever, which without a cap leaves the viewer on the
// loading spinner indefinitely with no error ever shown. These bound how many
// times we retry before giving up and surfacing a message.
const MAX_MEDIA_ERROR_RECOVERIES = 2;
const MAX_NETWORK_ERROR_RETRIES = 5;

// How often playback position is reported upwards. Anything much tighter
// would write to localStorage (and re-render subscribers) for no real gain.
const PROGRESS_INTERVAL_MS = 5000;

export default function VideoPlayer({
  src,
  isHls,
  ext,
  onEnded,
  onProgress,
  onTimeUpdate,
  startPosition = 0,
  // Ref holding the current play token. Kept as a ref (not a prop value) so a
  // token refresh mid-stream never re-runs the setup effect and restarts
  // playback - see the hls.js xhrSetup below.
  tokenRef,
  // Ref this component fills with { seek(seconds) } once the video element
  // exists, so a parent (the skip-intro button) can command playback without
  // needing direct access to the <video> node.
  actionsRef,
  muted = false,
  controls = true,
  className = '',
}) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [offerExternalLink, setOfferExternalLink] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Kept in refs so the setup effect below doesn't need to depend on them -
  // depending on them directly would tear down and reattach hls.js (restarting
  // playback) on every parent re-render that passes a new closure.
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  const startPositionRef = useRef(startPosition);
  useEffect(() => {
    startPositionRef.current = startPosition;
  }, [startPosition]);

  // Multiview switches audio between tiles constantly. React's `muted` prop
  // is applied as an attribute, which the element ignores after load, so drive
  // the property directly.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted]);

  const containerExt = (ext || '').toLowerCase().replace(/^\./, '');
  const unsupportedContainer = !isHls && UNSUPPORTED_CONTAINERS.has(containerExt);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || unsupportedContainer) return undefined;

    let cancelled = false;
    let hls;
    let blackFrameTimer;
    let lastReportAt = 0;

    setStatus('loading');
    setErrorMessage('');
    setOfferExternalLink(false);

    // Live streams report Infinity (or 0) - there is nothing to resume into.
    function seekableDuration() {
      const duration = video.duration;
      return Number.isFinite(duration) && duration > 0 ? duration : 0;
    }

    function report(completed) {
      if (!onProgressRef.current) return;
      lastReportAt = Date.now();
      onProgressRef.current(video.currentTime || 0, seekableDuration(), { completed: !!completed });
    }

    function handleLoadedMetadata() {
      const resumeAt = Number(startPositionRef.current) || 0;
      const duration = seekableDuration();
      // Never resume into the last few seconds - that just replays the credits.
      if (resumeAt > 0 && duration && resumeAt < duration - 10) {
        try {
          video.currentTime = resumeAt;
        } catch {
          // Some servers reject range requests; playing from the start is
          // better than failing outright.
        }
      }
    }

    function handleTimeUpdate() {
      if (cancelled) return;
      onTimeUpdateRef.current?.(video.currentTime || 0);
      if (video.paused) return;
      if (Date.now() - lastReportAt < PROGRESS_INTERVAL_MS) return;
      report(false);
    }

    function handlePause() {
      if (!cancelled && !video.ended) report(false);
    }

    // Closing the tab or navigating away with the browser's own controls never
    // runs React cleanup, so the last few seconds would be lost without this.
    function handlePageHide() {
      if (!cancelled && !video.ended && video.currentTime > 0) report(false);
    }

    function handleCanPlay() {
      if (!cancelled) setStatus('ready');
    }

    function handleVideoError() {
      if (cancelled) return;
      setStatus('error');
      setErrorMessage('Nao foi possivel reproduzir este conteudo.');
    }

    function handleEnded() {
      report(true);
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
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('pause', handlePause);
    window.addEventListener('pagehide', handlePageHide);

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
        hls = new Hls({
          maxBufferLength: 30,
          // Every segment request is re-signed with the freshest token, so a
          // long live session outlives the token it started with.
          xhrSetup: (xhr, url) => {
            const token = tokenRef?.current;
            xhr.open('GET', token ? withPlayToken(url, token) : url, true);
          },
        });
        let mediaErrorRecoveries = 0;
        let networkErrorRetries = 0;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (cancelled || !data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            networkErrorRetries += 1;
            if (networkErrorRetries > MAX_NETWORK_ERROR_RETRIES) {
              setStatus('error');
              setErrorMessage('Falha ao carregar o stream.');
              return;
            }
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            // bufferAddCodecError means the browser rejected the codec outright -
            // no amount of recoverMediaError() will ever fix that, so fail fast
            // with a clear message instead of retrying forever.
            const unrecoverable = data.details === 'bufferAddCodecError';
            mediaErrorRecoveries += 1;
            if (unrecoverable || mediaErrorRecoveries > MAX_MEDIA_ERROR_RECOVERIES) {
              setStatus('error');
              setErrorMessage(unrecoverable ? CODEC_UNSUPPORTED_MESSAGE : 'Falha ao carregar o stream.');
              setOfferExternalLink(unrecoverable);
              return;
            }
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

    if (actionsRef) {
      actionsRef.current = {
        seek(seconds) {
          try {
            video.currentTime = seconds;
          } catch {
            // Ignored - a rejected seek leaves playback where it was.
          }
        },
      };
    }

    return () => {
      // Leaving the page mid-episode is the common case, so flush the exact
      // position before tearing the element down.
      if (!video.ended && video.currentTime > 0) report(false);
      cancelled = true;
      clearTimeout(blackFrameTimer);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleVideoError);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('pause', handlePause);
      window.removeEventListener('pagehide', handlePageHide);
      if (actionsRef) actionsRef.current = null;
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, isHls, ext, unsupportedContainer, retryKey, tokenRef, actionsRef]);

  const displayStatus = unsupportedContainer ? 'error' : status;
  const displayMessage = unsupportedContainer
    ? UNSUPPORTED_CONTAINER_MESSAGE(containerExt)
    : errorMessage;
  const displayOfferLink = unsupportedContainer || offerExternalLink;

  return (
    <div className={`${styles.wrap} ${className}`.trim()}>
      <video
        ref={videoRef}
        className={styles.video}
        controls={controls}
        muted={muted}
        autoPlay
        playsInline
      />
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
