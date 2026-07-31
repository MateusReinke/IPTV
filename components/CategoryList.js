'use client';

import styles from './CategoryList.module.css';

export default function CategoryList({ categories, activeId, onSelect }) {
  return (
    <div className={styles.list}>
      {categories.map((cat) => (
        <button
          key={cat.category_id}
          type="button"
          className={`${styles.item} ${cat.category_id === activeId ? styles.itemActive : ''}`}
          onClick={() => onSelect(cat.category_id)}
        >
          <span className={styles.name}>{cat.category_name}</span>
        </button>
      ))}
    </div>
  );
}
