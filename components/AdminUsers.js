'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { entitlementsFor } from '@/lib/entitlements';
import Button from './Button';
import Spinner from './Spinner';
import styles from './AdminUsers.module.css';

// Subscriber table with the manual levers: grant, extend, revoke, suspend and
// hand over a password-reset link. Everything here writes an audit row.

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'trialing', label: 'Em teste' },
  { id: 'active', label: 'Assinantes' },
  { id: 'expired', label: 'Expirados' },
];

const PAGE_SIZE = 25;

export default function AdminUsers() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState(null);

  const {
    data = { rows: [], total: 0 },
    isLoading: loading,
    mutate: load,
  } = useSWR(['admin-users', query, status, page], async () => {
    const params = new URLSearchParams({
      q: query,
      status,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    const res = await fetch(`/api/admin/users?${params}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao carregar contas');
    return res.json();
  });

  // Debounce typing so each keystroke does not hit the database.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim().toLowerCase());
      setPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  async function act(userId, action, extra = {}) {
    setBusyId(`${userId}:${action}`);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, action, ...extra }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Falha na acao');
      if (body?.link) {
        setMessage({ tone: 'info', text: `Link de redefinicao (2h): ${body.link}` });
      }
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setBusyId('');
    }
  }

  const pages = Math.ceil(data.total / PAGE_SIZE) || 1;

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>Assinantes</h2>
        <input
          className={styles.search}
          placeholder="Buscar por e-mail ou nome..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className={styles.filters}>
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`${styles.filter} ${status === filter.id ? styles.filterActive : ''}`}
              onClick={() => {
                setStatus(filter.id);
                setPage(0);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <p className={message.tone === 'error' ? styles.error : styles.info}>{message.text}</p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Conta</th>
              <th>Plano</th>
              <th>Ate</th>
              <th>Cadastro</th>
              <th className={styles.actionsCol}>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className={styles.center}>
                  <Spinner size={22} />
                </td>
              </tr>
            )}
            {!loading && data.rows.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.center}>
                  Nenhuma conta encontrada.
                </td>
              </tr>
            )}
            {!loading &&
              data.rows.map((row) => {
                const ent = entitlementsFor(row);
                return (
                  <tr key={row.id} className={row.disabled_at ? styles.rowDisabled : ''}>
                    <td>
                      <div className={styles.email}>{row.email}</div>
                      <div className={styles.sub}>
                        {row.name || 'sem nome'}
                        {row.role === 'admin' && <span className={styles.adminTag}>admin</span>}
                        {row.disabled_at && <span className={styles.offTag}>suspensa</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.plan} ${styles[`plan_${ent.plan}`]}`}>
                        {ent.plan === 'trial' ? 'Teste' : ent.plan === 'premium' ? 'Premium' : 'Livre'}
                      </span>
                      {row.cancel_at_period_end && <div className={styles.sub}>cancelando</div>}
                      {row.provider && <div className={styles.sub}>{row.provider}</div>}
                    </td>
                    <td className={styles.dateCell}>
                      {ent.expiresAt
                        ? new Date(ent.expiresAt).toLocaleDateString('pt-BR')
                        : '-'}
                      {ent.daysLeft !== null && (
                        <div className={styles.sub}>{ent.daysLeft} dia(s)</div>
                      )}
                    </td>
                    <td className={styles.dateCell}>
                      {new Date(row.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <Button
                          variant="secondary"
                          loading={busyId === `${row.id}:grant_premium`}
                          onClick={() => act(row.id, 'grant_premium', { days: 30 })}
                        >
                          +30d Premium
                        </Button>
                        <Button
                          variant="ghost"
                          loading={busyId === `${row.id}:extend_trial`}
                          onClick={() => act(row.id, 'extend_trial', { days: 7 })}
                        >
                          +7d teste
                        </Button>
                        <Button
                          variant="ghost"
                          loading={busyId === `${row.id}:reset_link`}
                          onClick={() => act(row.id, 'reset_link')}
                        >
                          Link de senha
                        </Button>
                        <Button
                          variant="ghost"
                          loading={busyId === `${row.id}:revoke`}
                          onClick={() => act(row.id, 'revoke')}
                        >
                          Revogar
                        </Button>
                        <Button
                          variant="ghost"
                          loading={busyId === `${row.id}:${row.disabled_at ? 'enable' : 'disable'}`}
                          onClick={() => act(row.id, row.disabled_at ? 'enable' : 'disable')}
                        >
                          {row.disabled_at ? 'Reativar' : 'Suspender'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className={styles.pager}>
          <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className={styles.pagerLabel}>
            Pagina {page + 1} de {pages} · {data.total} conta(s)
          </span>
          <Button
            variant="ghost"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Proxima
          </Button>
        </div>
      )}
    </section>
  );
}
