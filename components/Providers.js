'use client';

import { SWRConfig } from 'swr';
import SyncAgent from './SyncAgent';

export default function Providers({ children }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, errorRetryCount: 2 }}>
      <SyncAgent />
      {children}
    </SWRConfig>
  );
}
