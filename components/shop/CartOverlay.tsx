"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X, Plus, Minus, Trash2, ShoppingBag, ArrowRight } from "@/components/shop/icons";
import { useCartStore } from "@/store/shopCart";
import { fmtMoney } from "@/lib/storefront/format";

// Hợp nhất CartModal (desktop-only) + CartDrawer (mobile-only, chỉ mount ở
// trang chủ trong bản Denfood gốc — khiến trang chi tiết sản phẩm/tra đơn
// không mở được giỏ hàng trên mobile) thành 1 component responsive duy nhất,
// mount 1 lần ở app/(storefront)/layout.tsx.
export default function CartOverlay() {
  const { items, isOpen, closeCart, removeItem, updateQty, totalItems, totalPrice, openCheckout } = useCartStore();
  const count = totalItems();
  const total = totalPrice();

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-shop-fade-in" onClick={closeCart} />

      <div
        className="fixed z-50 flex flex-col bg-white shadow-2xl
        bottom-0 left-0 right-0 max-h-[90vh] rounded-t-3xl animate-shop-slide-in-up
        lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[420px] lg:max-h-full lg:rounded-none lg:rounded-l-3xl lg:animate-shop-slide-in-right"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-shop-primary" />
            <h2 className="text-lg font-black text-shop-text">Giỏ hàng</h2>
            {count > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-shop-primary text-xs font-bold text-white">
                {count}
              </span>
            )}
          </div>
          <button onClick={closeCart} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 transition-colors hover:bg-gray-200">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-50 text-4xl">🛒</div>
              <div>
                <p className="font-semibold text-shop-text">Giỏ hàng trống</p>
                <p className="mt-1 text-sm text-shop-text-muted">Chọn sản phẩm để bắt đầu.</p>
              </div>
              <button onClick={closeCart} className="mt-2 rounded-xl bg-shop-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-shop-primary-dark">
                Khám phá sản phẩm
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.product_id} className="flex gap-3 rounded-xl border border-gray-100 bg-shop-surface p-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl">🛒</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-shop-text">{item.name}</p>
                    <p className="mt-1 text-sm font-bold text-shop-primary">{fmtMoney(item.price)}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center overflow-hidden rounded-lg border border-gray-200">
                        <button
                          onClick={() => updateQty(item.product_id, item.quantity - 1)}
                          className="flex h-7 w-7 items-center justify-center transition-colors hover:bg-gray-100"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.product_id, item.quantity + 1)}
                          disabled={item.quantity >= item.stock}
                          className="flex h-7 w-7 items-center justify-center transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(item.product_id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-all hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {item.quantity >= item.stock && (
                      <p className="mt-1 text-[11px] text-amber-600">Chỉ còn {item.stock} sản phẩm</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="space-y-3 border-t border-gray-100 px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-shop-text-muted">Tổng đơn</span>
              <span className="text-xl font-black text-shop-primary">{fmtMoney(total)}</span>
            </div>
            <button
              type="button"
              onClick={openCheckout}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-shop-primary py-3.5 font-bold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-shop-primary-dark hover:shadow-blue-500/30"
            >
              Tiếp tục đặt hàng
              <ArrowRight size={16} />
            </button>
            <Link href="/shop/don" onClick={closeCart} className="block text-center text-xs font-semibold text-shop-text-muted hover:text-shop-primary">
              Tra cứu đơn đã đặt
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
