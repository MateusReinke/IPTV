'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { normalize } from '@/lib/text';
import { xtreamRequest } from '@/lib/xtream';
import SearchBox from './SearchBox';
import Spinner from './Spinner';
import { ErrorState } from './StateMessage';
import styles from './ChannelPicker.module.css';

// Full-catalog channel chooser for a multiview tile. The whole live list is
// fetched once and cached by SWR, so opening the picker for the ninth tile is
// instant.

const MAX_RESULTS = 300;

export default function ChannelPicker({ playlist, open, onPick, onClose }) {
  const [search, setSearch] = useState('');

  const { data, isLoading, error, mutate } = useSWR(
    open && playlist ? ['multiview-live', playlist.id] : null,
    () => xtreamRequest(playlist, 'get_live_streams').then((res) => (Array.isArray(res) ? res : []))
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const list = data || [];
    const query = normalize(search);
    const filtered = query ? list.filter((item) => normalize(item.name).includes(query)) : list;
    return filtered.slice(0, MAX_RESULTS);
  }, [data, search]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Escolher canal">
        <div className={styles.head}>
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar canal..." />
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {isLoading && (
            <div className={styles.center}>
              <Spinner size={26} />
            </div>
          )}
          {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
          {!isLoading && !error && results.length === 0 && (
            <p className={styles.empty}>Nenhum canal encontrado.</p>
          )}
          {!isLoading &&
            !error &&
            results.map((item) => (
              <button
                key={item.stream_id}
                type="button"
                className={styles.item}
                onClick={() =>
                  onPick({
                    id: String(item.stream_id),
                    name: item.name,
                    icon: item.stream_icon || '',
                  })
                }
              >
                <span className={styles.thumb}>
                  {item.stream_icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.stream_icon} alt="" loading="lazy" />
                  ) : (
                    (item.name || '?').trim().charAt(0).toUpperCase()
                  )}
                </span>
                <span className={styles.name}>{item.name}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
