'use client';

import styles from './CategoryList.module.css';

export default function CategoryList({ categories, activeId, onSelect }) {
  return (
    <div className={styles.row}>
      {categories.map((cat) => (
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
  );
}
