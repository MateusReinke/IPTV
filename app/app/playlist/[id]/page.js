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
import AiPickDialog from '@/components/AiPickDialog';
import NavRail from '@/components/NavRail';
import SearchBox from '@/components/SearchBox';
import CategoryList from '@/components/CategoryList';
import MediaGrid from '@/components/MediaGrid';
import MediaCard from '@/components/MediaCard';
import Shelf from '@/components/Shelf';
import StatusPill from '@/components/StatusPill';
import Button from '@/components/Button';
import Hero from '@/components/Hero';
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
  const [aiPickOpen, setAiPickOpen] = useState(false);
  const isSearching = search.trim().length > 0;
  const isFavoritesTab = activeTab === 'favorites';
  const isHistoryTab = activeTab === 'history';
  // Tabs served from local storage rather than from the Xtream API.
  const isLocalTab = isFavoritesTab || isHistoryTab;

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

  const canShuffle = !isLocalTab && (activeTab === 'movie' || activeTab === 'series');
  // The recommender reads the movie catalog, so it is offered where that
  // catalog is what the user is looking at.
  const canAskAi = activeTab === 'movie' && !isSearching;

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
            {canAskAi && (
              <Button variant="secondary" onClick={() => setAiPickOpen(true)}>
                <SparkIcon />
                Indicacao da IA
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

      {aiPickOpen && playlist && (
        <AiPickDialog
          playlist={playlist}
          categories={categories}
          history={history}
          favorites={favorites}
          onClose={() => setAiPickOpen(false)}
          onPlay={(pick) => {
            setAiPickOpen(false);
            goToPlayer({
              type: 'movie',
              streamId: String(pick.id),
              ext: pick.ext || 'mp4',
              title: pick.name || '',
              poster: pick.image || '',
            });
          }}
        />
      )}
    </div>
  );
}

function SparkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3l1.8 4.8L18.6 9.6l-4.8 1.8L12 16.2l-1.8-4.8L5.4 9.6l4.8-1.8L12 3zM18 15l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z" />
    </svg>
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

function formatExpiry(unixSeconds) {
  const n = Number(unixSeconds);
  if (!n) return '';
  try {
    return new Date(n * 1000).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}
