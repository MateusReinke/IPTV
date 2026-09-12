'use client';

import { useEffect, useState } from 'react';
import styles from './SetupWarning.module.css';

// Shown above the signup/login forms when the server cannot serve them - a
// missing DATABASE_URL, an unreachable Postgres, migrations that never ran.
// Without this the only symptom is a button that does nothing useful, and the
// cause is buried in the container logs.
export default function SetupWarning() {
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    let active = true;
    fetch('/api/health', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (!data?.canCreateAccounts) {
          setProblem(data?.checks?.database?.error || 'O servidor nao esta pronto.');
        }
      })
      .catch(() => {
        // Network failure here says nothing specific; the form's own error
        // handling covers it.
      });
    return () => {
      active = false;
    };
  }, []);

  if (!problem) return null;

  return (
    <div className={styles.box} role="alert">
      <strong className={styles.title}>Servidor sem banco de dados</strong>
      <p className={styles.text}>{problem}</p>
      <p className={styles.hint}>
        Detalhes em <code>/api/health</code>. Veja <code>.env.example</code> e o README para as
        variaveis necessarias.
      </p>
    </div>
  );
}
