"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

export interface StorefrontCustomer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
}

interface CustomerContextType {
  customer: StorefrontCustomer | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const CustomerContext = createContext<CustomerContextType | undefined>(undefined);

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<StorefrontCustomer | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/storefront/auth/me");
      const data = await res.json();
      setCustomer(data.customer ?? null);
    } catch {
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/storefront/auth/logout", { method: "POST" }).catch(() => undefined);
    setCustomer(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <CustomerContext.Provider value={{ customer, loading, refresh, logout }}>{children}</CustomerContext.Provider>
  );
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error("useCustomer must be used within CustomerProvider");
  return ctx;
}
