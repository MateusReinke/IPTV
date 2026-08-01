'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { usePlaylist } from '@/lib/playlists';
import { accountIsActive, xtreamRequest } from '@/lib/xtream';
import { normalize } from '@/lib/text';
import { toFavoriteEntry, toggleFavorite, useFavoriteKeys, useFavorites } from '@/lib/favorites';
import NavRail from '@/components/NavRail';
import SearchBox from '@/components/SearchBox';
import CategoryList from '@/components/CategoryList';
import MediaGrid from '@/components/MediaGrid';
import MediaCard from '@/components/MediaCard';
import StatusPill from '@/components/StatusPill';
import Hero from '@/components/Hero';
import { SkeletonGrid, SkeletonChips } from '@/components/Skeleton';
import { ErrorState, EmptyState } from '@/components/StateMessage';
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

export default function BrowsePage() {
  const { id } = useParams();
  const router = useRouter();
  const playlist = usePlaylist(id);

  const [activeTab, setActiveTab] = useState('live');
  const [activeCategory, setActiveCategory] = useState({});
  const [search, setSearch] = useState('');
  const isSearching = search.trim().length > 0;
  const isFavoritesTab = activeTab === 'favorites';

  const tabConfig = TABS.find((t) => t.value === activeTab);

  const { data: account } = useSWR(playlist ? ['xtream-account', playlist.id] : null, () =>
    xtreamRequest(playlist, undefined).then((res) => res?.user_info ?? null)
  );

  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError,
    mutate: reloadCategories,
  } = useSWR(playlist && !isFavoritesTab ? ['xtream-categories', playlist.id, activeTab] : null, () =>
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
    !isFavoritesTab && !isSearching && playlist && currentCategoryId
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
    !isFavoritesTab && isSearching && playlist ? ['xtream-items-all', playlist.id, activeTab] : null,
    () => xtreamRequest(playlist, tabConfig.streamAction).then((res) => (Array.isArray(res) ? res : []))
  );

  const favorites = useFavorites(playlist?.id);
  const favoriteKeys = useFavoriteKeys(playlist?.id);

  const items = isFavoritesTab ? favorites : isSearching ? allItems : categoryItems;
  const itemsLoading = isFavoritesTab ? false : isSearching ? allItemsLoading : categoryItemsLoading;
  const itemsError = isFavoritesTab ? null : isSearching ? allItemsError : categoryItemsError;
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
    !isFavoritesTab && !isSearching && activeTab !== 'live' && categoryItems && categoryItems.length > 0
      ? categoryItems[0]
      : null;

  function selectTab(tab) {
    setActiveTab(tab);
    setSearch('');
  }

  function selectCategory(catId) {
    setActiveCategory((prev) => ({ ...prev, [activeTab]: catId }));
    setSearch('');
  }

  function openItem(item) {
    const title = encodeURIComponent(item.name || '');
    if (activeTab === 'live') {
      router.push(`/playlist/${id}/player?type=live&streamId=${item.stream_id}&title=${title}`);
    } else if (activeTab === 'movie') {
      const ext = encodeURIComponent(item.container_extension || 'mp4');
      router.push(
        `/playlist/${id}/player?type=movie&streamId=${item.stream_id}&ext=${ext}&title=${title}`
      );
    } else {
      router.push(`/playlist/${id}/series/${item.series_id}?title=${title}`);
    }
  }

  function openFavorite(fav) {
    const title = encodeURIComponent(fav.name || '');
    if (fav.kind === 'live') {
      router.push(`/playlist/${id}/player?type=live&streamId=${fav.id}&title=${title}`);
    } else if (fav.kind === 'movie') {
      const ext = encodeURIComponent(fav.ext || 'mp4');
      router.push(`/playlist/${id}/player?type=movie&streamId=${fav.id}&ext=${ext}&title=${title}`);
    } else {
      router.push(`/playlist/${id}/series/${fav.id}?title=${title}`);
    }
  }

  function openFeaturedDetails() {
    if (!featuredItem || activeTab !== 'series') return;
    const title = encodeURIComponent(featuredItem.name || '');
    router.push(`/playlist/${id}/series/${featuredItem.series_id}?title=${title}`);
  }

  function handleToggleFavorite(item) {
    if (!playlist) return;
    toggleFavorite(playlist.id, toFavoriteEntry(item, activeTab));
  }

  if (playlist === null) {
    return (
      <main className={styles.shell}>
        <ErrorState message="Playlist nao encontrada." onRetry={() => router.push('/')} />
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <NavRail tabs={TABS} active={activeTab} onChange={selectTab} onHome={() => router.push('/')} />

      <main className={styles.main}>
        <header className={styles.topHeader}>
          <p className={styles.playlistTitle}>{playlist.title}</p>
          {account && (
            <StatusPill tone={accountIsActive(account) ? 'active' : 'danger'}>
              {accountIsActive(account) ? 'Ativa' : 'Expirada'}
              {account.exp_date ? ` · ate ${formatExpiry(account.exp_date)}` : ''}
            </StatusPill>
          )}
        </header>

        <div className={styles.content}>
          {featuredItem && (
            <Hero
              kind={activeTab}
              item={featuredItem}
              onPlay={() => openItem(featuredItem)}
              onMoreInfo={activeTab === 'series' ? openFeaturedDetails : undefined}
              favorited={favoriteKeys.has(
                `${activeTab}:${featuredItem.stream_id || featuredItem.series_id}`
              )}
              onToggleFavorite={() => handleToggleFavorite(featuredItem)}
            />
          )}

          {!isFavoritesTab && (
            <div className={styles.categorySection}>
              {categoriesLoading && <SkeletonChips count={7} />}
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

          <div className={styles.toolbar}>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder={`Buscar em ${isFavoritesTab ? 'Favoritos' : tabConfig.label}...`}
            />
            {isSearching && !isFavoritesTab && !itemsLoading && !itemsError && (
              <span className={styles.resultHint}>
                {filteredItems.length}{' '}
                {filteredItems.length === 1 ? 'resultado' : 'resultados'} em todas as categorias
              </span>
            )}
          </div>

          {itemsLoading && (
            <SkeletonGrid
              count={activeTab === 'live' ? 12 : 14}
              aspect={activeTab === 'live' ? 'landscape' : 'portrait'}
              columnWidth={activeTab === 'live' ? 170 : 150}
            />
          )}
          {itemsError && <ErrorState message={itemsError.message} onRetry={() => reloadItems()} />}
          {!itemsLoading && !itemsError && filteredItems.length === 0 && (
            <EmptyState
              message={
                isFavoritesTab
                  ? 'Nenhum favorito ainda. Toque no coracao em um canal, filme ou serie para adiciona-lo aqui.'
                  : isSearching
                    ? `Nenhum resultado para "${search.trim()}".`
                    : 'Nenhum item encontrado.'
              }
            />
          )}
          {!itemsLoading && !itemsError && filteredItems.length > 0 && (
            <MediaGrid columnWidth={activeTab === 'live' ? 170 : 150}>
              {isFavoritesTab
                ? filteredItems.map((fav) => (
                    <MediaCard
                      key={`${fav.kind}:${fav.id}`}
                      title={fav.name}
                      subtitle={KIND_LABEL[fav.kind]}
                      image={fav.image}
                      aspect={fav.kind === 'live' ? 'landscape' : 'portrait'}
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

function formatExpiry(unixSeconds) {
  const n = Number(unixSeconds);
  if (!n) return '';
  try {
    return new Date(n * 1000).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}
