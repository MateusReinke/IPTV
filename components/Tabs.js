'use client';

import styles from './Tabs.module.css';

export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === active}
          className={`${styles.tab} ${tab.value === active ? styles.tabActive : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
