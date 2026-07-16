"use client";

// context/OrderContext.tsx
// Lưu danh sách toàn bộ đơn hàng đã đặt - dùng localStorage để không mất khi reload trang

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Order } from "@/types";

interface OrderContextType {
  orders: Order[];
  lastOrder: Order | null;
  addOrder: (order: Order) => void;
  updateOrderStatus: (orderId: string, status: string) => void;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);
const STORAGE_KEY = "timetech_orders";

function readOrdersFromStorage(): Order[] {
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

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);

  // Đọc dữ liệu đã lưu ngay khi app khởi động (chỉ chạy phía client)
  useEffect(() => {
    setOrders(readOrdersFromStorage());
  }, []);

  const persist = (updated: Order[]) => {
    setOrders(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  };

  const addOrder = (order: Order) => {
    const current = readOrdersFromStorage();
    const updated = [order, ...current];
    persist(updated);
  };

  const updateOrderStatus = (orderId: string, status: string) => {
    const current = readOrdersFromStorage();
    const updated = current.map((o) => (o.id === orderId ? { ...o, status } : o));
    persist(updated);
  };

  const lastOrder = orders.length > 0 ? orders[0] : null;

  return (
    <OrderContext.Provider value={{ orders, lastOrder, addOrder, updateOrderStatus }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder() {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error("useOrder phải được dùng bên trong OrderProvider");
  }
  return context;
}

// Đọc trực tiếp đơn hàng gần nhất từ localStorage (dùng khi trang success vừa load, tránh nhấp nháy)
export function getStoredLastOrder(): Order | null {
  const orders = readOrdersFromStorage();
  return orders.length > 0 ? orders[0] : null;
}