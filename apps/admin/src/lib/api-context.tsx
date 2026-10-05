'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ApiClient } from '@wfb/shared-api';
import { api, currentAdmin } from './api';

interface ApiState {
  api: ApiClient;
  admin: { id: number; nickname: string; role: string } | null;
  ready: boolean;
  refreshAdmin: () => void;
}

const Ctx = createContext<ApiState | null>(null);

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<ApiState['admin']>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAdmin(currentAdmin());
    setReady(true);
  }, []);

  const value = useMemo<ApiState>(
    () => ({ api, admin, ready, refreshAdmin: () => setAdmin(currentAdmin()) }),
    [admin, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApi(): ApiState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApi 必须在 ApiProvider 内使用');
  return v;
}
