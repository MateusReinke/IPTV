'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { xtreamRequest } from '@/lib/xtream';
import { buildProfile, genreLabel, selectCandidates } from '@/lib/recommend';
import { useEntitlements } from './SessionProvider';
import Button from './Button';
import Spinner from './Spinner';
import UpgradeNotice from './UpgradeNotice';
import { ErrorState } from './StateMessage';
import styles from './AiPickDialog.module.css';

// "Indicacao da IA": pick a genre, and the recommender reads what this account
// has been watching to choose one film out of that genre and say why.
//
// The catalog is read here, in the browser, and only the shortlist is posted
// to /api/recommend - the server never needs the playlist credentials, and the
// prompt stays small. The plan quota is enforced server side; this dialog only
// explains it.

export default function AiPickDialog({ playlist, categories, history, favorites, onClose, onPlay }) {
  const entitlements = useEntitlements();
  const cooldownDays = entitlements?.features?.aiPickCooldownDays || 0;

  const [genreId, setGenreId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // What the last call said about the quota. It only ever *replaces* the
  // fetched status (a pick just spent, or a 429 explaining the wait), so it
  // stays a plain override rather than a copy kept in sync with SWR.
  const [spentQuota, setSpentQuota] = useState(null);

  // What the plan allows right now. Asked before anything is spent, so the
  // free plan can see the wait instead of discovering it on a 429.
  const { data: status, isLoading: statusLoading, mutate: reloadStatus } = useSWR(
    'ai-pick-status',
    () => fetch('/api/recommend', { cache: 'no-store' }).then((res) => res.json())
  );

  // The whole movie catalog, shared (same SWR key) with the search on the
  // browse page - opening this dialog after a search costs nothing.
  const { data: catalog, isLoading: catalogLoading, error: catalogError } = useSWR(
    playlist ? ['xtream-items-all', playlist.id, 'movie'] : null,
    () =>
      xtreamRequest(playlist, 'get_vod_streams').then((res) => (Array.isArray(res) ? res : []))
  );

  const quota = spentQuota || status || null;

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Category names as genres, deduplicated: panels often split the same genre
  // across "FILMES | ACAO" and "4K | ACAO".
  const genres = useMemo(() => {
    const byLabel = new Map();
    for (const category of categories || []) {
      const label = genreLabel(category.category_name);
      if (!label) continue;
      const existing = byLabel.get(label);
      if (existing) existing.ids.push(category.category_id);
      else byLabel.set(label, { label, ids: [category.category_id] });
    }
    return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [categories]);

  const categoryNameById = useMemo(() => {
    const map = new Map();
    (categories || []).forEach((category) => map.set(category.category_id, category.category_name));
    return map;
  }, [categories]);

  const selectedGenre = genres.find((genre) => genre.label === genreId) || null;

  const askForPick = useCallback(async () => {
    if (!playlist || busy) return;
    setBusy(true);
    setError('');
    try {
      const items = catalog || [];
      const genreOf = (item) => genreLabel(categoryNameById.get(item.category_id));
      // A film already watched is not a recommendation, so it is dropped from
      // the shortlist instead of being explained away by the model.
      const watched = new Set(
        history.filter((entry) => entry.kind === 'movie').map((entry) => String(entry.id))
      );
      const pool = selectedGenre
        ? items.filter((item) => selectedGenre.ids.includes(item.category_id))
        : items;
      const candidates = selectCandidates(pool, { genreOf, exclude: watched });

      if (candidates.length === 0) {
        setError(
          selectedGenre
            ? 'Voce ja assistiu tudo o que esta nesse genero. Escolha outro.'
            : 'Nao encontrei filmes novos neste catalogo.'
        );
        return;
      }

      const genreById = new Map();
      for (const item of items) {
        if (item.stream_id === undefined) continue;
        genreById.set(`movie:${item.stream_id}`, genreOf(item));
      }

      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'movie',
          genre: selectedGenre?.label || '',
          candidates,
          profile: buildProfile({ history, favorites, genreById }),
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (data?.quota) setSpentQuota({ ...quota, ...data.quota });
        throw new Error(data?.error || 'Nao foi possivel montar a indicacao agora.');
      }

      setResult(data);
      if (data.quota) setSpentQuota({ ...quota, ...data.quota });
      reloadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    catalog,
    categoryNameById,
    favorites,
    history,
    playlist,
    quota,
    reloadStatus,
    selectedGenre,
  ]);

  const locked = quota && quota.unlimited === false && quota.allowed === false;
  const loadingCatalog = catalogLoading || (statusLoading && !quota);

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Indicacao da IA"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>
              <SparkIcon /> Indicacao da IA
            </h2>
            {!result && (
              <p className={styles.lead}>
                Escolha um genero e eu leio o seu historico para achar o filme certo para hoje.
              </p>
            )}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        {locked && !result && (
          <UpgradeNotice
            title={`Sua proxima indicacao ${formatNextAvailable(quota.nextAvailableAt)}`}
            message={`No plano gratuito a indicacao da IA vale uma vez a cada ${quota.cooldownDays} dias. No Premium voce pede quantas quiser.`}
            compact
          />
        )}

        {!locked && !result && (
          <>
            <div className={styles.genres}>
              <button
                type="button"
                className={`${styles.chip} ${genreId === '' ? styles.chipActive : ''}`}
                onClick={() => setGenreId('')}
              >
                Qualquer genero
              </button>
              {genres.map((genre) => (
                <button
                  key={genre.label}
                  type="button"
                  className={`${styles.chip} ${genreId === genre.label ? styles.chipActive : ''}`}
                  onClick={() => setGenreId(genre.label)}
                >
                  {genre.label}
                </button>
              ))}
            </div>

            {catalogError && <ErrorState message={catalogError.message} />}
            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <Button
                variant="primary"
                loading={busy || loadingCatalog}
                disabled={!!catalogError}
                onClick={askForPick}
              >
                {loadingCatalog ? 'Lendo o catalogo...' : busy ? 'Escolhendo...' : 'Indicar um filme'}
              </Button>
              {cooldownDays > 0 && (
                <span className={styles.quotaNote}>
                  Plano gratuito: 1 indicacao a cada {cooldownDays} dias.
                </span>
              )}
            </div>
          </>
        )}

        {busy && !result && (
          <p className={styles.working}>
            <Spinner size={16} /> Comparando o catalogo com o que voce ja assistiu...
          </p>
        )}

        {result && (
          <PickResult
            result={result}
            quota={quota}
            busy={busy}
            error={error}
            onPlay={() => onPlay(result.pick)}
            onRetry={quota?.unlimited ? askForPick : null}
          />
        )}
      </div>
    </div>
  );
}

function PickResult({ result, quota, busy, error, onPlay, onRetry }) {
  const { pick } = result;
  return (
    <div className={styles.result}>
      <div className={styles.pick}>
        {pick.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.poster} src={pick.image} alt="" />
        ) : (
          <span className={`${styles.poster} ${styles.posterFallback}`} aria-hidden="true">
            {pick.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className={styles.pickBody}>
          <h3 className={styles.pickName}>{pick.name}</h3>
          <p className={styles.pickMeta}>
            {[pick.genre, pick.rating > 0 ? `nota ${pick.rating}` : ''].filter(Boolean).join(' · ')}
          </p>
          <p className={styles.reason}>{result.reason}</p>
          {result.profileNote && <p className={styles.note}>{result.profileNote}</p>}
        </div>
      </div>

      {result.alternates?.length > 0 && (
        <div className={styles.alternates}>
          <p className={styles.alternatesTitle}>Se nao for hoje</p>
          <ul className={styles.alternatesList}>
            {result.alternates.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                {item.why ? ` - ${item.why}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <Button variant="primary" onClick={onPlay}>
          Assistir agora
        </Button>
        {onRetry && (
          <Button variant="secondary" loading={busy} onClick={onRetry}>
            Indicar outro
          </Button>
        )}
      </div>

      {result.engine === 'local' && (
        <p className={styles.engineNote}>
          {result.degraded
            ? 'A IA nao respondeu agora: esta indicacao veio do ranking do proprio servidor.'
            : 'Este servidor esta sem ANTHROPIC_API_KEY, entao a indicacao veio do ranking local (nota + generos que voce assiste).'}
        </p>
      )}
      {quota && quota.unlimited === false && quota.nextAvailableAt && (
        <p className={styles.engineNote}>
          Proxima indicacao do plano gratuito {formatNextAvailable(quota.nextAvailableAt)}.
        </p>
      )}
    </div>
  );
}

function formatNextAvailable(iso) {
  if (!iso) return 'em breve';
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return 'em breve';
  const days = Math.ceil((target.getTime() - Date.now()) / 86400000);
  if (days <= 0) return 'ja esta liberada';
  if (days === 1) return 'e amanha';
  return `e em ${days} dias (${target.toLocaleDateString('pt-BR')})`;
}

function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l1.8 4.8L18.6 9.6l-4.8 1.8L12 16.2l-1.8-4.8L5.4 9.6l4.8-1.8L12 3zM18 15l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z"
        fill="currentColor"
      />
    </svg>
  );
}
