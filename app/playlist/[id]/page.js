'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { usePlaylist } from '@/lib/playlists';
import { accountIsActive, xtreamRequest } from '@/lib/xtream';
import { normalize } from '@/lib/text';
import Tabs from '@/components/Tabs';
import SearchBox from '@/components/SearchBox';
import CategoryList from '@/components/CategoryList';
import MediaGrid from '@/components/MediaGrid';
import MediaCard from '@/components/MediaCard';
import StatusPill from '@/components/StatusPill';
import { SkeletonGrid, SkeletonRows } from '@/components/Skeleton';
import { ErrorState, EmptyState } from '@/components/StateMessage';
import styles from './page.module.css';

const TABS = [
  {
    value: 'live',
    label: 'TV ao vivo',
    catAction: 'get_live_categories',
    streamAction: 'get_live_streams',
  },
  {
    value: 'movie',
    label: 'Filmes',
    catAction: 'get_vod_categories',
    streamAction: 'get_vod_streams',
  },
  {
    value: 'series',
    label: 'Series',
    catAction: 'get_series_categories',
    streamAction: 'get_series',
  },
];

export default function BrowsePage() {
  const { id } = useParams();
  const router = useRouter();
  const playlist = usePlaylist(id);

  const [activeTab, setActiveTab] = useState('live');
  const [activeCategory, setActiveCategory] = useState({});
  const [search, setSearch] = useState('');
  const isSearching = search.trim().length > 0;

  const tabConfig = TABS.find((t) => t.value === activeTab);

  const { data: account } = useSWR(playlist ? ['xtream-account', playlist.id] : null, () =>
    xtreamRequest(playlist, undefined).then((res) => res?.user_info ?? null)
  );

  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError,
    mutate: reloadCategories,
  } = useSWR(playlist ? ['xtream-categories', playlist.id, activeTab] : null, () =>
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
    !isSearching && playlist && currentCategoryId
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
  } = useSWR(isSearching && playlist ? ['xtream-items-all', playlist.id, activeTab] : null, () =>
    xtreamRequest(playlist, tabConfig.streamAction).then((res) => (Array.isArray(res) ? res : []))
  );

  const items = isSearching ? allItems : categoryItems;
  const itemsLoading = isSearching ? allItemsLoading : categoryItemsLoading;
  const itemsError = isSearching ? allItemsError : categoryItemsError;
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

  if (playlist === null) {
    return (
      <main className={styles.page}>
        <ErrorState message="Playlist nao encontrada." onRetry={() => router.push('/')} />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <button type="button" className={styles.back} onClick={() => router.push('/')} aria-label="Voltar">
            <BackIcon />
          </button>
          <div>
            <p className={styles.playlistTitle}>{playlist.title}</p>
            {account && (
              <StatusPill tone={accountIsActive(account) ? 'active' : 'danger'}>
                {accountIsActive(account) ? 'Ativa' : 'Expirada'}
                {account.exp_date ? ` · ate ${formatExpiry(account.exp_date)}` : ''}
              </StatusPill>
            )}
          </div>
        </div>
        <Tabs tabs={TABS} active={activeTab} onChange={selectTab} />
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          {categoriesLoading && <SkeletonRows count={10} />}
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
        </aside>

        <section className={styles.content}>
          <div className={styles.toolbar}>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder={`Buscar em ${tabConfig.label}...`}
            />
            {isSearching && !itemsLoading && !itemsError && (
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
                isSearching ? `Nenhum resultado para "${search.trim()}".` : 'Nenhum item encontrado.'
              }
            />
          )}
          {!itemsLoading && !itemsError && filteredItems.length > 0 && (
            <MediaGrid columnWidth={activeTab === 'live' ? 170 : 150}>
              {filteredItems.map((item) => (
                <MediaCard
                  key={item.stream_id || item.series_id}
                  title={item.name}
                  subtitle={isSearching ? categoryNameById.get(item.category_id) : undefined}
                  image={item.stream_icon || item.cover}
                  aspect={activeTab === 'live' ? 'landscape' : 'portrait'}
                  onClick={() => openItem(item)}
                />
              ))}
            </MediaGrid>
          )}
        </section>
      </div>
    </main>
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

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
