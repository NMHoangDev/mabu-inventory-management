"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import type { AppStore } from "@/lib/shared/schema";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
};

export type Lookups = {
  suppliers: string[];
  inputProductNames: string[];
  internalProductCodes: string[];
  adjustedInvoiceNames: string[];
  retailNames: string[];
  units: string[];
  vatRates: string[];
  products: Array<{
    sku: string;
    inputProductName: string;
    adjustedInvoiceName: string;
    retailName: string;
    unit: string;
    salePrice?: string;
    imageUrl?: string;
  }>;
};

const emptyStore: AppStore = { documents: [], rows: [] };
const emptyLookups: Lookups = {
  suppliers: [],
  inputProductNames: [],
  internalProductCodes: [],
  adjustedInvoiceNames: [],
  retailNames: [],
  units: [],
  vatRates: [],
  products: []
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 180);
    throw new Error(
      response.ok
        ? `API không trả JSON hợp lệ. ${preview}`
        : `API lỗi ${response.status}. ${preview || response.statusText}`
    );
  }
}

interface AppContextType {
  store: AppStore;
  setStore: React.Dispatch<React.SetStateAction<AppStore>>;
  lookups: Lookups;
  loading: boolean;
  error: string;
  setError: (msg: string) => void;
  notice: string;
  setNotice: (msg: string) => void;
  confirmAction: (options: ConfirmOptions) => Promise<boolean>;
  refreshLookups: () => Promise<void>;
  productMeta: Record<string, { salePrice: string; imageUrl: string }>;
  setProductMeta: React.Dispatch<React.SetStateAction<Record<string, { salePrice: string; imageUrl: string }>>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<AppStore>(emptyStore);
  const [lookups, setLookups] = useState<Lookups>(emptyLookups);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [productMeta, setProductMeta] = useState<Record<string, { salePrice: string; imageUrl: string }>>({});

  const loadState = async () => {
    const [stateResponse, lookupResponse] = await Promise.all([fetch("/api/state"), fetch("/api/lookups")]);
    const data = await readJsonResponse<AppStore & { error?: string }>(stateResponse);
    const lookupData = await readJsonResponse<Lookups & { error?: string }>(lookupResponse);
    if (!stateResponse.ok) throw new Error(data.error ?? "Không tải được dữ liệu hóa đơn.");
    if (!lookupResponse.ok) throw new Error(lookupData.error ?? "Không tải được danh sách gợi ý.");
    setStore(data);
    setLookups({ ...emptyLookups, ...lookupData });
  };

  const refreshLookups = async () => {
    const response = await fetch("/api/lookups");
    const data = await readJsonResponse<Lookups & { error?: string }>(response);
    if (!response.ok) throw new Error(data.error ?? "Không tải được danh sách gợi ý.");
    setLookups({ ...emptyLookups, ...data });
  };

  useEffect(() => {
    loadState()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Không tải được dữ liệu."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("invoiceflow-product-meta");
      if (raw) setProductMeta(JSON.parse(raw));
    } catch {
      setProductMeta({});
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("invoiceflow-product-meta", JSON.stringify(productMeta));
    } catch {
      // Browser storage can be unavailable in private mode.
    }
  }, [productMeta]);

  useEffect(() => {
    if (lookups.products.length === 0) return;
    setProductMeta((current) => {
      const next = { ...current };
      for (const product of lookups.products) {
        if (!product.sku) continue;
        next[`sku:${product.sku}`] = {
          salePrice: product.salePrice ?? "",
          imageUrl: product.imageUrl ?? ""
        };
      }
      return next;
    });
  }, [lookups.products]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(""), 7600);
    return () => window.clearTimeout(timeout);
  }, [error]);

  const confirmAction = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = resolve;
      setConfirmOptions({
        cancelLabel: "Hủy",
        confirmLabel: "Xác nhận",
        tone: "primary",
        ...options
      });
    });

  const closeConfirm = (confirmed: boolean) => {
    confirmResolverRef.current?.(confirmed);
    confirmResolverRef.current = null;
    setConfirmOptions(null);
  };

  return (
    <AppContext.Provider
      value={{
        store,
        setStore,
        lookups,
        loading,
        error,
        setError,
        notice,
        setNotice,
        confirmAction,
        refreshLookups,
        productMeta,
        setProductMeta
      }}
    >
      {children}
      {confirmOptions ? (
        <div className="fixed inset-0 z-[170] grid place-items-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <button className="absolute inset-0" aria-label="Đóng xác nhận" onClick={() => closeConfirm(false)} />
          <div className="relative w-full max-w-md rounded-xl border bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-950">{confirmOptions.title}</div>
            {confirmOptions.description ? (
              <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{confirmOptions.description}</div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => closeConfirm(false)}
              >
                {confirmOptions.cancelLabel}
              </button>
              <button
                type="button"
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                  confirmOptions.tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:opacity-90"
                }`}
                onClick={() => closeConfirm(true)}
              >
                {confirmOptions.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
