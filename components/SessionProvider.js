'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// The signed-in account and what its plan unlocks. Seeded from the server
// layout (so the first paint already knows) and refreshable after a checkout
// or a plan change.

const SessionContext = createContext({
  user: null,
  entitlements: null,
  refresh: async () => {},
});

export default function SessionProvider({ value, children }) {
  const [session, setSession] = useState(value || { user: null, entitlements: null });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = await res.json();
      setSession({ user: data.user, entitlements: data.entitlements });
      return data;
    } catch {
      return null;
    }
  }, []);

  const contextValue = useMemo(
    () => ({ user: session.user, entitlements: session.entitlements, refresh }),
    [session, refresh]
  );

  return <SessionContext.Provider value={contextValue}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export function useEntitlements() {
  return useContext(SessionContext).entitlements;
}

// Convenience for the many places that only care whether one feature is on.
export function useFeature(name) {
  const entitlements = useEntitlements();
  return !!entitlements?.features?.[name];
}
