'use client';

import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import HeartIcon from './HeartIcon';
import Spinner from './Spinner';
import styles from './AiPickModal.module.css';

// The reveal for "IA escolhe pra você": a focused overlay instead of quietly
// swapping the category Hero, since this is the direct result of a click and
// deserves a moment of attention rather than a change the user might not
// notice above the fold.
export default function AiPickModal({
  open,
  kind,
  status, // 'loading' | 'error' | 'ready'
  item,
  reason,
  errorMessage,
  canRequestNew,
  requestingNew,
  pendingTheme, // undefined = idle; null = "Surpreenda-me" in flight; string = that theme
  themes = [],
  daysRemaining,
  favorited,
  onClose,
  onOpenItem,
  onToggleFavorite,
  onRequestNew, // (theme: string | null) => void
}) {
  const [closing, setClosing] = useState(false);

  // Resets `closing` when `open` flips back to true, without an effect:
  // adjusting state during render (comparing against a ref of the previous
  // value) is the pattern React itself recommends over a setState-in-effect,
  // which would cost an extra commit for something render can settle inline.
  const wasOpenRef = useRef(open);
  if (wasOpenRef.current !== open) {
    wasOpenRef.current = open;
    if (open && closing) setClosing(false);
  }

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') requestClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // Exit plays out before the callback removes the modal from the tree, so
  // closing is never an instant cut - matches the entrance's authored feel.
  function requestClose() {
    setClosing(true);
    setTimeout(onClose, 180);
  }

  const title = item?.name || '';
  const isSeries = kind === 'series';
  const themesLabel = canRequestNew
    ? 'Quer de outro clima?'
    : `Nova escolha em ${daysRemaining} dia${daysRemaining === 1 ? '' : 's'}`;

  return (
    <div
      className={`${styles.backdrop} ${closing ? styles.closing : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        className={`${styles.dialog} ${closing ? styles.closing : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={status === 'ready' ? title : 'Escolha da IA'}
      >
        <button type="button" className={styles.close} onClick={requestClose} aria-label="Fechar">
          <CloseIcon />
        </button>

        <span className={styles.kicker}>
          <SparkleIcon /> Escolha da IA
        </span>

        {status === 'loading' && (
          <div className={styles.loading}>
            <Spinner size={26} />
            <p>Pensando em algo bom pra você...</p>
          </div>
        )}

        {status === 'error' && (
          <div className={styles.errorState}>
            <p>{errorMessage || 'Não foi possível consultar a IA agora.'}</p>
            <Button variant="secondary" onClick={() => onRequestNew(null)} loading={requestingNew}>
              Tentar de novo
            </Button>
          </div>
        )}

        {status === 'ready' && item && (
          <>
            <div className={styles.body}>
              <span className={styles.poster}>
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.posterImg} src={item.image} alt="" />
                ) : (
                  <span className={styles.fallback} aria-hidden="true">
                    {title.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                )}
              </span>
              <div className={styles.details}>
                <h2 className={styles.title}>{title}</h2>
                {(item.rating || item.genre) && (
                  <div className={styles.meta}>
                    {item.rating ? (
                      <span className={styles.tag}>★ {Number(item.rating).toFixed(1)}</span>
                    ) : null}
                    {item.genre ? <span className={styles.tag}>{item.genre}</span> : null}
                  </div>
                )}
                {item.plot && <p className={styles.plot}>{item.plot}</p>}
                {reason && <p className={styles.reason}>{reason}</p>}
              </div>
            </div>

            <div className={styles.actions}>
              <Button variant="primary" onClick={onOpenItem}>
                {isSeries ? <ListIcon /> : <PlayIcon />} {isSeries ? 'Ver episódios' : 'Assistir'}
              </Button>
              <button
                type="button"
                className={`${styles.favBtn} ${favorited ? styles.favBtnActive : ''}`}
                onClick={onToggleFavorite}
                aria-pressed={!!favorited}
                aria-label={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              >
                <HeartIcon filled={!!favorited} size={18} />
              </button>
            </div>

            {themes.length > 0 && (
              <div className={styles.themes}>
                <span className={styles.themesLabel}>{themesLabel}</span>
                <div className={styles.themeRow}>
                  <ThemeChip
                    label="Surpreenda-me"
                    loading={requestingNew && pendingTheme === null}
                    disabled={!canRequestNew || requestingNew}
                    onClick={() => onRequestNew(null)}
                  />
                  {themes.map((theme) => (
                    <ThemeChip
                      key={theme}
                      label={theme}
                      loading={requestingNew && pendingTheme === theme}
                      disabled={!canRequestNew || requestingNew}
                      onClick={() => onRequestNew(theme)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ThemeChip({ label, loading, disabled, onClick }) {
  return (
    <button type="button" className={styles.themeChip} onClick={onClick} disabled={disabled}>
      {loading ? <Spinner size={12} /> : label}
    </button>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l1.8 4.9L18.5 9.5 13.8 11.3 12 16.2 10.2 11.3 5.5 9.5 10.2 7.9 12 3zM5 15l.9 2.4L8.3 18l-2.4.9L5 21l-.9-2.1L1.7 18l2.4-.6L5 15zM19 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"
        fill="currentColor"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
