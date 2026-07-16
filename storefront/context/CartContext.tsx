"use client";

// context/CartContext.tsx
// Quản lý giỏ hàng - dùng localStorage để không mất khi reload trang

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Product, CartItem } from "@/types";

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  buyNow: (product: Product, quantity: number) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const STORAGE_KEY = "timetech_cart";

function readCartFromStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function productToCartItem(product: Product, quantity: number): CartItem {
  return {
    productId: product.id,
    name: product.name,
    price: product.price,
    image: product.images[0],
    quantity,
    stock: product.stock,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(readCartFromStorage());
  }, []);

  const persist = (updated: CartItem[]) => {
    setItems(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  };

  const addToCart = (product: Product, quantity: number) => {
    const current = readCartFromStorage();
    const existing = current.find((i) => i.productId === product.id);
    let updated: CartItem[];

    if (existing) {
      const maxQty = product.stock;
      const newQty = Math.min(existing.quantity + quantity, maxQty);
      updated = current.map((i) =>
        i.productId === product.id ? { ...i, quantity: newQty } : i
      );
    } else {
      updated = [...current, productToCartItem(product, Math.min(quantity, product.stock))];
    }

    persist(updated);
  };

  const removeFromCart = (productId: string) => {
    const current = readCartFromStorage();
    persist(current.filter((i) => i.productId !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    const current = readCartFromStorage();
    if (quantity <= 0) {
      persist(current.filter((i) => i.productId !== productId));
      return;
    }
    const updated = current.map((i) =>
      i.productId === productId ? { ...i, quantity: Math.min(quantity, i.stock) } : i
    );
    persist(updated);
  };

  const clearCart = () => {
    persist([]);
  };

  const buyNow = (product: Product, quantity: number) => {
    addToCart(product, quantity);
  };

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount,
        subtotal,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        buyNow,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart phải được dùng bên trong CartProvider");
  }
  return context;
}