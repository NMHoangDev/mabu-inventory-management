"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Giỏ hàng client-side (localStorage) cho /shop — không phải nguồn giá trị
// thật: lúc checkout, server luôn tra lại giá/tồn kho hiện tại từ DB
// (lib/storefront/checkout.ts) trước khi tạo đơn. Xem STOREFRONT_PLAN.md mục 4.
export interface ShopCartProduct {
  product_id: string;
  name: string;
  slug: string;
  unit: string;
  price: number;
  image_url: string;
  stock: number;
}

export interface ShopCartItem extends ShopCartProduct {
  quantity: number;
}

interface ShopCartState {
  items: ShopCartItem[];
  isOpen: boolean;
  isCheckoutOpen: boolean;

  addItem: (product: ShopCartProduct) => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  openCheckout: () => void;
  closeCheckout: () => void;

  totalItems: () => number;
  totalPrice: () => number;
}

export const useCartStore = create<ShopCartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      isCheckoutOpen: false,

      addItem: (product) => {
        if (product.stock <= 0) return;
        set((state) => {
          const existing = state.items.find((it) => it.product_id === product.product_id);
          if (existing) {
            const nextQty = Math.min(product.stock, existing.quantity + 1);
            return {
              items: state.items.map((it) =>
                it.product_id === product.product_id ? { ...it, quantity: nextQty, stock: product.stock } : it
              ),
            };
          }
          return { items: [...state.items, { ...product, quantity: 1 }] };
        });
      },

      removeItem: (productId) => {
        set((state) => ({ items: state.items.filter((it) => it.product_id !== productId) }));
      },

      updateQty: (productId, quantity) => {
        set((state) => {
          if (quantity <= 0) {
            return { items: state.items.filter((it) => it.product_id !== productId) };
          }
          return {
            items: state.items.map((it) =>
              it.product_id === productId ? { ...it, quantity: Math.min(quantity, Math.max(1, it.stock)) } : it
            ),
          };
        });
      },

      clearCart: () => set({ items: [] }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
      openCheckout: () => set({ isCheckoutOpen: true, isOpen: false }),
      closeCheckout: () => set({ isCheckoutOpen: false }),

      totalItems: () => get().items.reduce((sum, it) => sum + it.quantity, 0),
      totalPrice: () => get().items.reduce((sum, it) => sum + it.price * it.quantity, 0),
    }),
    {
      name: "shop-cart-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
    }
  )
);

const RECENT_ORDERS_KEY = "shop-recent-orders-v1";

export interface RecentOrderRef {
  code: string;
  phone: string;
  createdAt: string;
}

export function rememberOrder(ref: RecentOrderRef) {
  try {
    const raw = window.localStorage.getItem(RECENT_ORDERS_KEY);
    const list: RecentOrderRef[] = raw ? JSON.parse(raw) : [];
    window.localStorage.setItem(RECENT_ORDERS_KEY, JSON.stringify([ref, ...list].slice(0, 20)));
  } catch {
    /* storage unavailable */
  }
}

export function getRecentOrders(): RecentOrderRef[] {
  try {
    const raw = window.localStorage.getItem(RECENT_ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
