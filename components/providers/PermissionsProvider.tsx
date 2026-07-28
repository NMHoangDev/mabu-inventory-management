"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

type PermissionsContextValue = {
  permissions: Set<string>;
  roleName: string | null;
  loading: boolean;
  hasPermission: (key: string) => boolean;
  refresh: () => void;
};

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: new Set(),
  roleName: null,
  loading: true,
  hasPermission: () => true,
  refresh: () => {}
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [roleName, setRoleName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/zalo/me", { cache: "no-store" });
      const data = await res.json();
      setPermissions(new Set<string>(data?.permissions ?? []));
      setRoleName(data?.role_name ?? null);
    } catch {
      setPermissions(new Set());
      setRoleName(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, nonce]);

  const hasPermission = useCallback(
    (key: string) => permissions.has(key),
    [permissions]
  );

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return (
    <PermissionsContext.Provider value={{ permissions, roleName, loading, hasPermission, refresh }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
