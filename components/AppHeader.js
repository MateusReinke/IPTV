'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from './SessionProvider';
import { APP_NAME } from '@/lib/pricing';
import styles from './AppHeader.module.css';

const LINKS = [
  { href: '/app', label: 'Playlists', exact: true },
  { href: '/app/multiview', label: 'Multitela' },
  { href: '/app/conta', label: 'Conta' },
];

export default function AppHeader() {
  const { user, entitlements } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  const isActive = (link) => (link.exact ? pathname === link.href : pathname.startsWith(link.href));

  return (
    <header className={styles.header}>
      <Link href="/app" className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        {APP_NAME}
      </Link>

      <nav className={styles.nav}>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`${styles.link} ${isActive(link) ? styles.linkActive : ''}`}
          >
            {link.label}
          </Link>
        ))}
        {user?.role === 'admin' && (
          <Link
            href="/admin"
            className={`${styles.link} ${pathname.startsWith('/admin') ? styles.linkActive : ''}`}
          >
            Admin
          </Link>
        )}
      </nav>

      <div className={styles.right}>
        <PlanBadge entitlements={entitlements} />
        <button type="button" className={styles.logout} onClick={handleLogout}>
          Sair
        </button>
      </div>
    </header>
  );
}

function PlanBadge({ entitlements }) {
  if (!entitlements) return null;

  if (entitlements.plan === 'trial') {
    const urgent = entitlements.daysLeft <= 2;
    return (
      <Link href="/app/conta" className={`${styles.badge} ${urgent ? styles.badgeUrgent : styles.badgeTrial}`}>
        {entitlements.daysLeft === 0
          ? 'Teste termina hoje'
          : `Teste: ${entitlements.daysLeft} dia${entitlements.daysLeft === 1 ? '' : 's'}`}
      </Link>
    );
  }

  if (entitlements.plan === 'premium') {
    return <span className={`${styles.badge} ${styles.badgePremium}`}>Premium</span>;
  }

  return (
    <Link href="/app/conta" className={`${styles.badge} ${styles.badgeUpgrade}`}>
      Assinar Premium
    </Link>
  );
}
