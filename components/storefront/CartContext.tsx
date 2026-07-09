"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

// Giỏ hàng lưu client-side (localStorage) — xem STOREFRONT_PLAN.md mục 4.
// KHÔNG phải nguồn giá trị thật: lúc checkout, server luôn tra lại giá/tồn
// kho hiện tại từ DB (lib/storefront/checkout.ts) trước khi tạo đơn.
export interface CartItem {
  product_id: string;
  name: string;
  slug: string;
  unit: string;
  price: number;
  image_url: string;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  totalQty: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const STORAGE_KEY = "storefront-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore corrupted cart */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable (private mode) */
    }
  }, [items, hydrated]);

  const addItem = useCallback((item: Omit<CartItem, "quantity">, quantity = 1) => {
    setItems((current) => {
      const existing = current.find((it) => it.product_id === item.product_id);
      if (existing) {
        return current.map((it) =>
          it.product_id === item.product_id ? { ...it, quantity: it.quantity + quantity } : it
        );
      }
      return [...current, { ...item, quantity }];
    });
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    setItems((current) =>
      quantity <= 0
        ? current.filter((it) => it.product_id !== productId)
        : current.map((it) => (it.product_id === productId ? { ...it, quantity } : it))
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((current) => current.filter((it) => it.product_id !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const totalQty = items.reduce((s, it) => s + it.quantity, 0);
  const totalPrice = items.reduce((s, it) => s + it.quantity * it.price, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateQuantity, removeItem, clear, totalQty, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
