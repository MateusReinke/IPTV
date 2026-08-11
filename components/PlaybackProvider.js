'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// Client half of the screen-limit system.
//
// Every picture ("tile") claims a lease from the server before it can play,
// and keeps it alive with a heartbeat. The play token that comes back is
// per-account, so all tiles share one - what differs per tile is the lease.
// When a tile is refused, the caller gets the reason and can offer an upgrade
// instead of a broken player.

const HEARTBEAT_MS = 30000;

const PlaybackContext = createContext(null);

export default function PlaybackProvider({ children }) {
  const [token, setToken] = useState('');
  const tokenRef = useRef('');
  const tilesRef = useRef(new Map());
  const timerRef = useRef(null);

  // The ref always holds the freshest token (hls.js re-signs every segment with
  // it). The state deliberately only ever takes the *first* one: it feeds the
  // <video> src, and changing that mid-stream would reload the media element
  // and restart playback on every heartbeat.
  const applyToken = useCallback((next) => {
    if (!next || next === tokenRef.current) return;
    tokenRef.current = next;
    setToken((current) => current || next);
  }, []);

  const request = useCallback(
    async (tileId, label) => {
      const res = await fetch('/api/play/lease', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tileId, label }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const error = new Error(data?.error || 'Nao foi possivel liberar a reproducao');
        error.code = data?.code || (res.status === 401 ? 'UNAUTHENTICATED' : 'ERROR');
        error.screens = data?.screens;
        throw error;
      }
      applyToken(data.token);
      return data;
    },
    [applyToken]
  );

  // One timer refreshes every open tile: N tiles must not mean N timers
  // drifting against each other.
  useEffect(() => {
    timerRef.current = setInterval(() => {
      for (const [tileId, entry] of tilesRef.current) {
        request(tileId, entry.label).catch((err) => {
          entry.onError?.(err);
        });
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(timerRef.current);
  }, [request]);

  const claim = useCallback(
    async (tileId, label, onError) => {
      tilesRef.current.set(tileId, { label, onError });
      try {
        return await request(tileId, label);
      } catch (err) {
        tilesRef.current.delete(tileId);
        throw err;
      }
    },
    [request]
  );

  const release = useCallback((tileId) => {
    tilesRef.current.delete(tileId);
    // keepalive lets the release survive a page navigation.
    fetch(`/api/play/lease?tileId=${encodeURIComponent(tileId)}`, {
      method: 'DELETE',
      keepalive: true,
    }).catch(() => {});
  }, []);

  // Closing the tab never runs React cleanup, and without this the slots stay
  // taken until the lease expires - long enough for someone on a one-screen
  // plan to think the paywall is broken.
  useEffect(() => {
    function releaseEverything() {
      for (const tileId of tilesRef.current.keys()) {
        navigator.sendBeacon?.(
          `/api/play/lease?tileId=${encodeURIComponent(tileId)}&_method=delete`
        ) ||
          fetch(`/api/play/lease?tileId=${encodeURIComponent(tileId)}`, {
            method: 'DELETE',
            keepalive: true,
          }).catch(() => {});
      }
      tilesRef.current.clear();
    }
    window.addEventListener('pagehide', releaseEverything);
    return () => window.removeEventListener('pagehide', releaseEverything);
  }, []);

  const value = useMemo(() => ({ token, tokenRef, claim, release }), [token, claim, release]);

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() {
  const context = useContext(PlaybackContext);
  if (!context) throw new Error('usePlayback precisa estar dentro de PlaybackProvider');
  return context;
}

// Claims a slot for one tile and keeps it for as long as the component lives.
// Returns the shared play token plus any refusal, so callers can render an
// upgrade prompt in place of the video.
export function usePlaybackSlot(tileId, label, enabled = true) {
  const { token, tokenRef, claim, release } = usePlayback();
  const [attempt, setAttempt] = useState(0);
  // Outcome is stamped with the request it belongs to, so switching channels
  // (or retrying) invalidates the previous result by derivation instead of by
  // resetting state from inside the effect.
  const [outcome, setOutcome] = useState({ key: null, ready: false, error: null });
  const requestKey = `${tileId}:${attempt}:${enabled ? 1 : 0}`;

  useEffect(() => {
    if (!enabled || !tileId) return undefined;
    let cancelled = false;

    claim(tileId, label, (err) => {
      if (!cancelled) {
        setOutcome({ key: requestKey, ready: false, error: { message: err.message, code: err.code } });
      }
    })
      .then(() => {
        if (!cancelled) setOutcome({ key: requestKey, ready: true, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setOutcome({ key: requestKey, ready: false, error: { message: err.message, code: err.code } });
        }
      });

    return () => {
      cancelled = true;
      release(tileId);
    };
  }, [claim, release, tileId, label, enabled, requestKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = outcome.key === requestKey ? outcome : null;

  return { token, tokenRef, ready: !!current?.ready, error: current?.error || null, retry };
}
