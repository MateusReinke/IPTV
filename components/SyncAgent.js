'use client';

import { useEffect } from 'react';
import { startAutoSync } from '@/lib/sync';
import { useFeature } from './SessionProvider';

// Mounted once from the app layout: keeps the local library and the account's
// cloud copy in step. Turns itself off when the plan does not include sync.
export default function SyncAgent() {
  const canSync = useFeature('sync');
  useEffect(() => startAutoSync(canSync), [canSync]);
  return null;
}
