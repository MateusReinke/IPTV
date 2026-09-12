import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuth } from '@/lib/server/auth';
import { APP_NAME } from '@/lib/pricing';
import styles from './layout.module.css';

export const metadata = { title: `Painel - ${APP_NAME}` };

export default async function AdminLayout({ children }) {
  const auth = await getAuth();
  if (!auth) redirect('/entrar?next=/admin');
  // Not a 403 page: someone who is not an admin has no reason to learn the
  // panel exists.
  if (auth.user.role !== 'admin') redirect('/app');

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <span className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          {APP_NAME} · painel
        </span>
        <nav className={styles.nav}>
          <Link href="/app">Voltar ao app</Link>
        </nav>
        <span className={styles.who}>{auth.user.email}</span>
      </header>
      {children}
    </div>
  );
}
