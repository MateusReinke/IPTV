'use client';

import { useState } from 'react';
import styles from './CategoryList.module.css';

// How many chips show before the "mostrar mais" toggle kicks in. Playlists
// with dozens of categories used to force a tiny internal scrollbar (or a
// half-cut row) - a plain "show more" reads better than scrolling inside a
// small box.
const COLLAPSED_COUNT = 14;

export default function CategoryList({ categories, activeId, onSelect }) {
  const [expanded, setExpanded] = useState(false);

  const activeIndex = categories.findIndex((cat) => cat.category_id === activeId);
  const hasMore = categories.length > COLLAPSED_COUNT;
  // A category restored from the URL (or picked earlier) could sit past the
  // fold - force it open rather than hiding the user's own selection.
  const forcedOpen = hasMore && activeIndex >= COLLAPSED_COUNT;
  const isOpen = expanded || forcedOpen;
  const visible = isOpen ? categories : categories.slice(0, COLLAPSED_COUNT);

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        {visible.map((cat) => (
          <button
            key={cat.category_id}
            type="button"
            className={`${styles.chip} ${cat.category_id === activeId ? styles.chipActive : ''}`}
            onClick={() => onSelect(cat.category_id)}
          >
            {cat.category_name}
          </button>
        ))}
      </div>
      {hasMore && !forcedOpen && (
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Mostrar menos' : `Mostrar mais ${categories.length - COLLAPSED_COUNT}`}
        </button>
      )}
    </div>
  );
}
