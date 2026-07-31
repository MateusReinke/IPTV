'use client';

import { useMemo, useState } from 'react';
import { normalize } from '@/lib/text';
import styles from './CategoryList.module.css';

export default function CategoryList({ categories, activeId, onSelect }) {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!filter.trim()) return categories;
    const q = normalize(filter);
    return categories.filter((cat) => normalize(cat.category_name).includes(q));
  }, [categories, filter]);

  return (
    <div className={styles.wrap}>
      {categories.length > 6 && (
        <input
          className={styles.filterInput}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar categorias..."
          aria-label="Filtrar categorias"
        />
      )}
      <div className={styles.list}>
        {filtered.map((cat) => (
          <button
            key={cat.category_id}
            type="button"
            className={`${styles.item} ${cat.category_id === activeId ? styles.itemActive : ''}`}
            onClick={() => onSelect(cat.category_id)}
          >
            <span className={styles.name}>{cat.category_name}</span>
          </button>
        ))}
        {filtered.length === 0 && <p className={styles.empty}>Nenhuma categoria encontrada.</p>}
      </div>
    </div>
  );
}
