'use client';

import { Suspense, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { usePlaylist } from '@/lib/playlists';
import { accountIsActive, xtreamRequest } from '@/lib/xtream';
import { normalize } from '@/lib/text';
import { toFavoriteEntry, toggleFavorite, useFavoriteKeys, useFavorites } from '@/lib/favorites';
import { pickWeightedByRating } from '@/lib/shuffle';
import {
  clearHistory,
  formatWatchedAt,
  historySubtitle,
  progressRatio,
  removeHistoryEntry,
  useContinueWatching,
  useHistory,
  useHistoryMap,
} from '@/lib/history';
import { useFeature } from '@/components/SessionProvider';
import UpgradeNotice from '@/components/UpgradeNotice';
import NavRail from '@/components/NavRail';
import SearchBox from '@/components/SearchBox';
import CategoryList from '@/components/CategoryList';
import MediaGrid from '@/components/MediaGrid';
import MediaCard from '@/components/MediaCard';
import Shelf from '@/components/Shelf';
import StatusPill from '@/components/StatusPill';
import Button from '@/components/Button';
import Hero from '@/components/Hero';
import AiPickModal from '@/components/AiPickModal';
import { SkeletonGrid, SkeletonChips } from '@/components/Skeleton';
import { ErrorState, EmptyState, LoadingState } from '@/components/StateMessage';
import styles from './page.module.css';

const TABS = [
  {
    value: 'live',
    label: 'TV ao vivo',
    shortLabel: 'Ao vivo',
    catAction: 'get_live_categories',
    streamAction: 'get_live_streams',
  },
  {
    value: 'movie',
    label: 'Filmes',
    shortLabel: 'Filmes',
    catAction: 'get_vod_categories',
    streamAction: 'get_vod_streams',
  },
  {
    value: 'series',
    label: 'Series',
    shortLabel: 'Series',
    catAction: 'get_series_categories',
    streamAction: 'get_series',
  },
];

const KIND_LABEL = { live: 'Ao vivo', movie: 'Filme', series: 'Serie' };
const VALID_TABS = ['live', 'movie', 'series', 'favorites', 'history'];

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <main className={styles.shell}>
          <LoadingState label="Carregando..." />
        </main>
      }
    >
      <BrowseContent />
    </Suspense>
  );
}

function BrowseContent() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const playlist = usePlaylist(id);

  // The active tab/category live in the URL (not just component state) so
  // that navigating away (a series, the player) and back restores the exact
  // screen the user left, instead of resetting to the default Live TV tab.
  const initialTab = VALID_TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'live';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [activeCategory, setActiveCategory] = useState(() => {
    const cat = searchParams.get('cat');
    return cat ? { [initialTab]: cat } : {};
  });
  const [search, setSearch] = useState('');
  const [shuffling, setShuffling] = useState(false);
  const isSearching = search.trim().length > 0;
  const isFavoritesTab = activeTab === 'favorites';
  const isHistoryTab = activeTab === 'history';
  // Tabs served from local storage rather than from the Xtream API.
  const isLocalTab = isFavoritesTab || isHistoryTab;
  const canShuffle = !isLocalTab && (activeTab === 'movie' || activeTab === 'series');

  const tabConfig = TABS.find((t) => t.value === activeTab);

  const { data: account } = useSWR(playlist ? ['xtream-account', playlist.id] : null, () =>
    xtreamRequest(playlist, undefined).then((res) => res?.user_info ?? null)
  );

  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError,
    mutate: reloadCategories,
  } = useSWR(playlist && !isLocalTab ? ['xtream-categories', playlist.id, activeTab] : null, () =>
    xtreamRequest(playlist, tabConfig.catAction).then((res) => (Array.isArray(res) ? res : []))
  );

  const currentCategoryId = activeCategory[activeTab] ?? categories?.[0]?.category_id ?? null;

  // Items for the selected category only - used while browsing (not searching).
  const {
    data: categoryItems,
    isLoading: categoryItemsLoading,
    error: categoryItemsError,
    mutate: reloadCategoryItems,
  } = useSWR(
    !isLocalTab && !isSearching && playlist && currentCategoryId
      ? ['xtream-items', playlist.id, activeTab, currentCategoryId]
      : null,
    () =>
      xtreamRequest(playlist, tabConfig.streamAction, { category_id: currentCategoryId }).then(
        (res) => (Array.isArray(res) ? res : [])
      )
  );

  // Full catalog for this tab (every category) - fetched once and cached the
  // moment the user starts typing, so search isn't limited to the open folder.
  const {
    data: allItems,
    isLoading: allItemsLoading,
    error: allItemsError,
    mutate: reloadAllItems,
  } = useSWR(
    !isLocalTab && isSearching && playlist ? ['xtream-items-all', playlist.id, activeTab] : null,
    () => xtreamRequest(playlist, tabConfig.streamAction).then((res) => (Array.isArray(res) ? res : []))
  );

  // "IA escolhe pra voce": estado da recomendacao e do cooldown, por conta
  // (nao por playlist) - ver app/api/ai/pick/route.js.
  const { data: aiStatus, mutate: mutateAiPick } = useSWR(canShuffle ? 'ai-pick' : null, () =>
    fetch('/api/ai/pick', { cache: 'no-store' }).then((res) => res.json())
  );
  const [aiPicking, setAiPicking] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiGenres, setAiGenres] = useState([]);
  // Which tab (movie/series) aiGenres was computed for, so switching tabs -
  // or reopening the modal on a cached pick - doesn't show stale chips.
  const [aiGenresKind, setAiGenresKind] = useState(null);
  // undefined = no request in flight; null = requesting with no theme filter
  // ("Surpreenda-me"); a string = which theme chip is loading.
  const [aiPendingTheme, setAiPendingTheme] = useState(undefined);
  const aiConfigured = !!aiStatus?.configured;
  const aiCanPickNow = !!aiStatus?.canPickNow;
  // The pick shown in the modal - only when it matches what's on screen, so
  // switching tabs never displays a movie pick while browsing Series.
  const aiPickForTab = aiStatus?.pick && aiStatus.pick.kind === activeTab ? aiStatus.pick : null;
  const aiDaysRemaining =
    aiStatus?.pick && !aiCanPickNow ? Math.max(1, daysUntil(aiStatus.pick.availableAt)) : 0;
  const aiModalStatus = aiPickForTab ? 'ready' : aiError ? 'error' : 'loading';

  // Watch history is a paid feature; favorites stay available to everyone.
  const canSeeHistory = useFeature('history');

  const favorites = useFavorites(playlist?.id);
  const favoriteKeys = useFavoriteKeys(playlist?.id);
  const history = useHistory(playlist?.id);
  const historyMap = useHistoryMap(playlist?.id);
  const continueWatching = useContinueWatching(playlist?.id);

  const items = isFavoritesTab
    ? favorites
    : isHistoryTab
      ? history
      : isSearching
        ? allItems
        : categoryItems;
  const itemsLoading = isLocalTab ? false : isSearching ? allItemsLoading : categoryItemsLoading;
  const itemsError = isLocalTab ? null : isSearching ? allItemsError : categoryItemsError;
  const reloadItems = isSearching ? reloadAllItems : reloadCategoryItems;

  const categoryNameById = useMemo(() => {
    const map = new Map();
    (categories || []).forEach((cat) => map.set(cat.category_id, cat.category_name));
    return map;
  }, [categories]);

  const filteredItems = useMemo(() => {
    const list = items || [];
    if (!isSearching) return list;
    const q = normalize(search);
    return list.filter((item) => normalize(item.name).includes(q));
  }, [items, search, isSearching]);

  const featuredItem =
    !isLocalTab && !isSearching && activeTab !== 'live' && categoryItems && categoryItems.length > 0
      ? categoryItems[0]
      : null;

  const showContinueShelf =
    canSeeHistory && !isLocalTab && !isSearching && continueWatching.length > 0;
  const historyLocked = isHistoryTab && !canSeeHistory;

  function updateUrl(tab, catId) {
    const params = new URLSearchParams();
    params.set('tab', tab);
    if (catId) params.set('cat', catId);
    router.replace(`/app/playlist/${id}?${params.toString()}`);
  }

  function selectTab(tab) {
    setActiveTab(tab);
    setSearch('');
    updateUrl(tab, activeCategory[tab]);
  }

  function selectCategory(catId) {
    setActiveCategory((prev) => ({ ...prev, [activeTab]: catId }));
    setSearch('');
    updateUrl(activeTab, catId);
  }

  function goToPlayer(params) {
    const query = new URLSearchParams(params);
    router.push(`/app/playlist/${id}/player?${query.toString()}`);
  }

  function openItem(item) {
    if (activeTab === 'live') {
      goToPlayer({
        type: 'live',
        streamId: String(item.stream_id),
        title: item.name || '',
        poster: item.stream_icon || '',
      });
    } else if (activeTab === 'movie') {
      goToPlayer({
        type: 'movie',
        streamId: String(item.stream_id),
        ext: item.container_extension || 'mp4',
        title: item.name || '',
        poster: item.stream_icon || '',
      });
    } else {
      router.push(
        `/app/playlist/${id}/series/${item.series_id}?title=${encodeURIComponent(item.name || '')}`
      );
    }
  }

  function openFavorite(fav) {
    if (fav.kind === 'live') {
      goToPlayer({
        type: 'live',
        streamId: String(fav.id),
        title: fav.name || '',
        poster: fav.image || '',
      });
    } else if (fav.kind === 'movie') {
      goToPlayer({
        type: 'movie',
        streamId: String(fav.id),
        ext: fav.ext || 'mp4',
        title: fav.name || '',
        poster: fav.image || '',
      });
    } else {
      router.push(
        `/app/playlist/${id}/series/${fav.id}?title=${encodeURIComponent(fav.name || '')}`
      );
    }
  }

  // History points at the exact stream that was watched, so a series entry
  // resumes its episode instead of bouncing through the series page.
  function openHistoryEntry(entry) {
    if (entry.kind === 'series') {
      goToPlayer({
        type: 'series',
        streamId: String(entry.id),
        ext: entry.ext || 'mp4',
        title: entry.episodeTitle
          ? `${entry.name} · T${entry.season} E${entry.episode} · ${entry.episodeTitle}`
          : entry.name || '',
        seriesId: String(entry.seriesId ?? ''),
        poster: entry.image || '',
      });
      return;
    }
    goToPlayer({
      type: entry.kind,
      streamId: String(entry.id),
      ext: entry.ext || (entry.kind === 'live' ? 'm3u8' : 'mp4'),
      title: entry.name || '',
      poster: entry.image || '',
    });
  }

  // Opens the item the AI recommended - same normalized shape as a favorite
  // (id/name/image/ext), since that is what /api/ai/pick stores and returns.
  function openAiPick(pick) {
    if (!pick) return;
    if (pick.kind === 'series') {
      router.push(
        `/app/playlist/${id}/series/${pick.item.id}?title=${encodeURIComponent(pick.item.name || '')}`
      );
      return;
    }
    goToPlayer({
      type: 'movie',
      streamId: String(pick.item.id),
      ext: pick.item.ext || 'mp4',
      title: pick.item.name || '',
      poster: pick.item.image || '',
    });
  }

  function handleToggleFavorite(item) {
    if (!playlist) return;
    toggleFavorite(playlist.id, toFavoriteEntry(item, activeTab));
  }

  function handleClearHistory() {
    if (!playlist) return;
    if (typeof window !== 'undefined' && !window.confirm('Apagar todo o historico desta playlist?')) {
      return;
    }
    clearHistory(playlist.id);
  }

  // Draws from the whole tab catalog (every category), not just the open
  // folder, so "surpreenda-me" has real variety to pick from.
  async function handleShuffle() {
    if (!playlist || shuffling) return;
    setShuffling(true);
    try {
      const list =
        allItems && allItems.length > 0
          ? allItems
          : await xtreamRequest(playlist, tabConfig.streamAction).then((res) =>
              Array.isArray(res) ? res : []
            );
      const pick = pickWeightedByRating(list);
      if (pick) openItem(pick);
    } finally {
      setShuffling(false);
    }
  }

  // Same catalog-loading fallback as handleShuffle - the full tab catalog,
  // not just the open category, used both for the AI request and for the
  // modal's theme chips.
  async function loadCatalogList() {
    return allItems && allItems.length > 0
      ? allItems
      : xtreamRequest(playlist, tabConfig.streamAction).then((res) => (Array.isArray(res) ? res : []));
  }

  // Loads (once per tab) the genres shown as theme chips, without requesting
  // a pick - needed when the modal opens straight into a cached pick, which
  // skips runAiPick entirely and would otherwise leave the chips empty.
  async function ensureAiGenres() {
    if (!playlist || aiGenresKind === activeTab) return;
    const list = await loadCatalogList();
    setAiGenres(extractGenres(list, categoryNameById));
    setAiGenresKind(activeTab);
  }

  // The pick itself comes from /api/ai/pick (server-side, so the API keys
  // never reach the browser) and is capped/sampled before sending to keep
  // the prompt small. Called both to fill an empty modal and from its theme
  // chips - `theme` null means "Surpreenda-me" (no genre filter).
  async function runAiPick(theme = null) {
    if (!playlist || aiPicking) return;
    setAiPicking(true);
    setAiPendingTheme(theme);
    setAiError(null);
    try {
      const list = await loadCatalogList();
      setAiGenres(extractGenres(list, categoryNameById));
      setAiGenresKind(activeTab);
      const themedList = theme
        ? list.filter((item) => itemMatchesTheme(item, theme, categoryNameById))
        : list;
      const candidates = sampleForAi(themedList, activeTab);
      if (candidates.length === 0) {
        setAiError(
          theme ? `Nenhum titulo de "${theme}" encontrado no catalogo atual.` : 'Nenhum item disponivel para recomendar.'
        );
        return;
      }
      const kindFavorites = [
        ...new Set(
          favorites
            .filter((f) => f.kind === activeTab)
            .map((f) => f.name)
            .filter(Boolean)
        ),
      ].slice(0, 20);
      const kindHistory = [
        ...new Set(
          history
            .filter((h) => h.kind === activeTab)
            .map((h) => h.name)
            .filter(Boolean)
        ),
      ].slice(0, 20);

      const res = await fetch('/api/ai/pick', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          playlistId: playlist.id,
          kind: activeTab,
          items: candidates,
          favoriteNames: kindFavorites,
          historyNames: kindHistory,
          theme: theme || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAiError((data && data.error) || 'Falha ao consultar a IA');
        // canPickNow vem do servidor (nao e sempre false: contas Premium/Trial
        // continuam podendo pedir de novo mesmo apos essa resposta).
        if (data?.pick) {
          mutateAiPick({ configured: true, pick: data.pick, canPickNow: !!data.canPickNow }, false);
        }
        return;
      }
      mutateAiPick({ configured: true, pick: data.pick, canPickNow: !!data.canPickNow }, false);
    } catch {
      setAiError('Nao foi possivel conectar ao servidor');
    } finally {
      setAiPicking(false);
      setAiPendingTheme(undefined);
    }
  }

  // Opens instantly on a cached pick for this tab (no network call); fetches
  // a fresh one only when there isn't one yet, showing the modal's own
  // loading state in the meantime.
  function openAiModal() {
    setAiModalOpen(true);
    setAiError(null);
    if (!aiPickForTab) {
      runAiPick();
    } else {
      ensureAiGenres();
    }
  }

  function closeAiModal() {
    setAiModalOpen(false);
  }

  if (playlist === null) {
    return (
      <main className={styles.shell}>
        <ErrorState message="Playlist nao encontrada." onRetry={() => router.push('/app')} />
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <NavRail tabs={TABS} active={activeTab} onChange={selectTab} onHome={() => router.push('/app')} />
      <AiPickModal
        open={aiModalOpen}
        kind={activeTab}
        status={aiModalStatus}
        item={aiPickForTab?.item}
        reason={aiPickForTab?.reason}
        errorMessage={aiError}
        canRequestNew={aiCanPickNow}
        requestingNew={aiPicking}
        pendingTheme={aiPendingTheme}
        themes={aiGenres}
        daysRemaining={aiDaysRemaining}
        favorited={aiPickForTab ? favoriteKeys.has(`${activeTab}:${aiPickForTab.item.id}`) : false}
        onClose={closeAiModal}
        onOpenItem={() => {
          closeAiModal();
          openAiPick(aiPickForTab);
        }}
        onToggleFavorite={() =>
          aiPickForTab &&
          toggleFavorite(playlist.id, {
            kind: activeTab,
            id: aiPickForTab.item.id,
            name: aiPickForTab.item.name,
            image: aiPickForTab.item.image,
            ext: aiPickForTab.item.ext,
          })
        }
        onRequestNew={runAiPick}
      />

      <main className={styles.main}>
        <header className={styles.topHeader}>
          <p className={styles.playlistTitle}>{playlist?.title}</p>
          {account && (
            <StatusPill tone={accountIsActive(account) ? 'active' : 'danger'}>
              {accountIsActive(account) ? 'Ativa' : 'Expirada'}
              {account.exp_date ? ` · ate ${formatExpiry(account.exp_date)}` : ''}
            </StatusPill>
          )}
        </header>

        <div className={styles.content}>
          {historyLocked && (
            <div className={styles.lockedSection}>
              <UpgradeNotice
                title="Historico e continuar assistindo"
                message="Guardar o que voce ja assistiu, retomar de onde parou e sincronizar entre aparelhos fazem parte do Premium."
              />
            </div>
          )}

          {showContinueShelf && (
            <Shelf title="Continuar assistindo" itemWidth={190} className={styles.continueShelf}>
              {continueWatching.map((entry) => (
                <MediaCard
                  key={`${entry.kind}:${entry.id}`}
                  title={entry.name}
                  subtitle={historySubtitle(entry)}
                  image={entry.image}
                  aspect="portrait"
                  progress={progressRatio(entry)}
                  onClick={() => openHistoryEntry(entry)}
                  onRemove={() => removeHistoryEntry(playlist.id, entry.kind, entry.id)}
                  removeLabel="Remover de continuar assistindo"
                />
              ))}
            </Shelf>
          )}

          {featuredItem && (
            <Hero
              kind={activeTab}
              item={featuredItem}
              onOpen={() => openItem(featuredItem)}
              favorited={favoriteKeys.has(
                `${activeTab}:${featuredItem.stream_id || featuredItem.series_id}`
              )}
              onToggleFavorite={() => handleToggleFavorite(featuredItem)}
            />
          )}

          {!isLocalTab && !historyLocked && (
            <div className={styles.categorySection}>
              {categoriesLoading && <SkeletonChips count={12} />}
              {categoriesError && (
                <ErrorState message={categoriesError.message} onRetry={() => reloadCategories()} />
              )}
              {!categoriesLoading && !categoriesError && (categories || []).length === 0 && (
                <EmptyState message="Nenhuma categoria disponivel." />
              )}
              {!categoriesLoading && !categoriesError && (categories || []).length > 0 && (
                <CategoryList
                  categories={categories}
                  activeId={isSearching ? null : currentCategoryId}
                  onSelect={selectCategory}
                />
              )}
            </div>
          )}

          {!historyLocked && (
          <div className={styles.toolbar}>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder={`Buscar em ${
                isFavoritesTab ? 'Favoritos' : isHistoryTab ? 'Historico' : tabConfig.label
              }...`}
            />
            {isSearching && !isLocalTab && !itemsLoading && !itemsError && (
              <span className={styles.resultHint}>
                {filteredItems.length}{' '}
                {filteredItems.length === 1 ? 'resultado' : 'resultados'} em todas as categorias
              </span>
            )}
            {canShuffle && !isSearching && (
              <Button variant="ghost" loading={shuffling} onClick={handleShuffle}>
                {!shuffling && <ShuffleIcon />}
                {activeTab === 'movie' ? 'Sortear um filme' : 'Sortear uma serie'}
              </Button>
            )}
            {canShuffle && !isSearching && aiConfigured && (
              <Button variant="ghost" onClick={openAiModal}>
                <SparkleIcon /> IA escolhe pra voce
              </Button>
            )}
            {isHistoryTab && history.length > 0 && (
              <Button variant="ghost" onClick={handleClearHistory}>
                Limpar historico
              </Button>
            )}
          </div>
          )}

          {!historyLocked && itemsLoading && (
            <SkeletonGrid
              count={activeTab === 'live' ? 12 : 14}
              aspect={activeTab === 'live' ? 'landscape' : 'portrait'}
              columnWidth={activeTab === 'live' ? 170 : 150}
            />
          )}
          {!historyLocked && itemsError && (
            <ErrorState message={itemsError.message} onRetry={() => reloadItems()} />
          )}
          {!historyLocked && !itemsLoading && !itemsError && filteredItems.length === 0 && (
            <EmptyState
              message={
                isFavoritesTab
                  ? 'Nenhum favorito ainda. Toque no coracao em um canal, filme ou serie para adiciona-lo aqui.'
                  : isHistoryTab
                    ? 'Nada assistido ainda. O que voce reproduzir aparece aqui, com o ponto onde parou.'
                    : isSearching
                      ? `Nenhum resultado para "${search.trim()}".`
                      : 'Nenhum item encontrado.'
              }
            />
          )}
          {!historyLocked && !itemsLoading && !itemsError && filteredItems.length > 0 && (
            <MediaGrid columnWidth={activeTab === 'live' ? 170 : 150}>
              {isHistoryTab
                ? filteredItems.map((entry) => (
                    <MediaCard
                      key={`${entry.kind}:${entry.id}`}
                      title={entry.name}
                      subtitle={`${historySubtitle(entry)} · ${formatWatchedAt(entry.watchedAt)}`}
                      image={entry.image}
                      aspect={entry.kind === 'live' ? 'landscape' : 'portrait'}
                      progress={progressRatio(entry)}
                      onClick={() => openHistoryEntry(entry)}
                      onRemove={() => removeHistoryEntry(playlist.id, entry.kind, entry.id)}
                      removeLabel="Remover do historico"
                    />
                  ))
                : isFavoritesTab
                  ? filteredItems.map((fav) => (
                      <MediaCard
                        key={`${fav.kind}:${fav.id}`}
                        title={fav.name}
                        subtitle={KIND_LABEL[fav.kind]}
                        image={fav.image}
                        aspect={fav.kind === 'live' ? 'landscape' : 'portrait'}
                        progress={progressRatio(historyMap.get(`${fav.kind}:${fav.id}`))}
                        onClick={() => openFavorite(fav)}
                        favorited
                        onToggleFavorite={() => toggleFavorite(playlist.id, fav)}
                      />
                    ))
                  : filteredItems.map((item) => (
                      <MediaCard
                        key={item.stream_id || item.series_id}
                        title={item.name}
                        subtitle={isSearching ? categoryNameById.get(item.category_id) : undefined}
                        image={item.stream_icon || item.cover}
                        aspect={activeTab === 'live' ? 'landscape' : 'portrait'}
                        progress={progressRatio(historyMap.get(`${activeTab}:${item.stream_id}`))}
                        onClick={() => openItem(item)}
                        favorited={favoriteKeys.has(
                          `${activeTab}:${item.stream_id || item.series_id}`
                        )}
                        onToggleFavorite={() => handleToggleFavorite(item)}
                      />
                    ))}
            </MediaGrid>
          )}
        </div>
      </main>
    </div>
  );
}

function ShuffleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17 3h4v4M21 3l-6.5 6.5M3 7h3.5c1.8 0 2.7.7 3.8 2M21 21h-4v-4M8 8l9.5 9.5M3 17h3.5c1.8 0 2.7-.7 3.8-2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const AI_CANDIDATE_LIMIT = 120;

// Normalizes a raw Xtream item into the slim shape /api/ai/pick accepts -
// same fields as lib/favorites.js's toFavoriteEntry, plus genre/rating/plot
// so the model has something to reason about.
function toAiCandidate(item, kind) {
  const id = kind === 'series' ? item.series_id : item.stream_id;
  if (id === undefined || id === null || !item.name) return null;
  return {
    id: String(id),
    name: item.name,
    image: kind === 'series' ? item.cover : item.stream_icon,
    ext: kind === 'movie' ? item.container_extension || 'mp4' : undefined,
    genre: item.genre || undefined,
    rating: Number(item.rating) || undefined,
    plot: item.plot || undefined,
  };
}

// Caps the payload sent to the AI: a random sample (not the first N) so a
// huge catalog isn't always judged by whatever sorts first alphabetically.
function sampleForAi(list, kind) {
  const mapped = list.map((item) => toAiCandidate(item, kind)).filter(Boolean);
  if (mapped.length <= AI_CANDIDATE_LIMIT) return mapped;
  const pool = [...mapped];
  const start = pool.length - AI_CANDIDATE_LIMIT;
  for (let i = pool.length - 1; i > start; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(start);
}

// Xtream panels are inconsistent about the per-item `genre` field - plenty
// of providers leave it empty and only encode genre in the category name
// (e.g. "Filmes | Comedia", as seen in this app's own category chips). A
// curated list matched against both sources is what actually works across
// providers; a list built purely from `item.genre` silently shows nothing
// for a catalog that never fills it in.
const THEME_KEYWORDS = [
  'Ação',
  'Animação',
  'Anime',
  'Aventura',
  'Biografia',
  'Comédia',
  'Crime',
  'Documentário',
  'Drama',
  'Esporte',
  'Família',
  'Fantasia',
  'Faroeste',
  'Ficção Científica',
  'Guerra',
  'Infantil',
  'Musical',
  'Mistério',
  'Romance',
  'Suspense',
  'Terror',
];

function itemMatchesTheme(item, theme, categoryNameById) {
  const needle = normalize(theme);
  if (item.genre && normalize(item.genre).includes(needle)) return true;
  const categoryName = categoryNameById.get(item.category_id);
  return !!categoryName && normalize(categoryName).includes(needle);
}

// Every keyword with at least one match in this catalog becomes a chip - no
// arbitrary cap, so a genre the catalog actually has (Terror, Romance...)
// never gets silently dropped for sorting after ten others. Alphabetical, not
// THEME_KEYWORDS order, so the row is easy to scan.
function extractGenres(list, categoryNameById) {
  return THEME_KEYWORDS.filter((theme) =>
    list.some((item) => itemMatchesTheme(item, theme, categoryNameById))
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l1.8 4.9L18.5 9.5 13.8 11.3 12 16.2 10.2 11.3 5.5 9.5 10.2 7.9 12 3zM5 15l.9 2.4L8.3 18l-2.4.9L5 21l-.9-2.1L1.7 18l2.4-.6L5 15zM19 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"
        fill="currentColor"
      />
    </svg>
  );
}

// Whole days left until `isoDate`, rounded up (0 once it has passed). Kept as
// a plain module-level function - like lib/history.js's formatWatchedAt - so
// the impure Date.now() read happens outside the component's render body.
function daysUntil(isoDate) {
  if (!isoDate) return 0;
  const diff = new Date(isoDate).getTime() - Date.now();
  return diff > 0 ? Math.ceil(diff / 86400000) : 0;
}

function formatExpiry(unixSeconds) {
  const n = Number(unixSeconds);
  if (!n) return '';
  try {
    return new Date(n * 1000).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}
