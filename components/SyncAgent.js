'use client';

import { useEffect } from 'react';
import { startAutoSync } from '@/lib/sync';

// Mounted once from Providers: keeps the local library and the (optional)
// sync account in step without any page having to think about it. No-op
// until the user actually sets up a sync code.
export default function SyncAgent() {
  useEffect(() => startAutoSync(), []);
  return null;
}
