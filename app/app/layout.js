import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/server/auth';
import SessionProvider from '@/components/SessionProvider';
import PlaybackProvider from '@/components/PlaybackProvider';
import SyncAgent from '@/components/SyncAgent';
import AppHeader from '@/components/AppHeader';

// Everything under /app needs an account: the plan decides how many screens
// may play at once and whether history is kept, and both are enforced server
// side against the session.

export default async function AppLayout({ children }) {
  const auth = await getAuth();
  if (!auth) redirect('/entrar?next=/app');

  return (
    <SessionProvider value={{ user: auth.user, entitlements: auth.entitlements }}>
      <PlaybackProvider>
        <SyncAgent />
        <AppHeader />
        {children}
      </PlaybackProvider>
    </SessionProvider>
  );
}
