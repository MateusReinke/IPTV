import { cookies } from 'next/headers';
import { SESSION_COOKIE, clearSessionCookie, revokeSession } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  await revokeSession(token);
  await clearSessionCookie();
  return Response.json({ ok: true });
}
