"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "@/components/storefront/CartContext";
import { fmtMoney } from "@/lib/storefront/format";

export default function CartPage() {
  const router = useRouter();
  const { items, updateQuantity, removeItem, totalPrice, totalQty } = useCart();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <ShoppingBag className="h-12 w-12 text-[var(--muted-foreground)]" />
        <p className="text-[var(--muted-foreground)]">Giỏ hàng của bạn đang trống.</p>
        <Link href="/shop/products" className="rounded-md bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90">
          Tiếp tục mua sắm
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="panel divide-y md:col-span-2">
        {items.map((item) => (
          <div key={item.product_id} className="flex items-center gap-3 p-4">
            <Link href={`/shop/products/${item.slug}`} className="h-16 w-16 shrink-0 overflow-hidden rounded bg-[var(--secondary)]">
              {item.image_url && <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/shop/products/${item.slug}`} className="line-clamp-2 text-sm font-medium hover:text-[var(--primary)]">
                {item.name}
              </Link>
              <div className="mt-1 text-sm text-[var(--primary)]">{fmtMoney(item.price)}</div>
            </div>
            <div className="flex items-center rounded-md border">
              <button
                onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                className="flex h-8 w-8 items-center justify-center hover:bg-[var(--accent)]"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-8 text-center text-sm">{item.quantity}</span>
              <button
                onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                className="flex h-8 w-8 items-center justify-center hover:bg-[var(--accent)]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="w-24 shrink-0 text-right text-sm font-semibold">{fmtMoney(item.price * item.quantity)}</div>
            <button
              onClick={() => removeItem(item.product_id)}
              className="shrink-0 rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--destructive)]"
              title="Xoá"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="panel h-fit space-y-4 p-5">
        <h2 className="section-title text-base">Tóm tắt đơn hàng</h2>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--muted-foreground)]">Số lượng ({totalQty} sản phẩm)</span>
          <span className="tabular-nums">{fmtMoney(totalPrice)}</span>
        </div>
        <div className="flex justify-between border-t pt-3 text-base font-semibold">
          <span>Tổng cộng</span>
          <span className="text-[var(--primary)]">{fmtMoney(totalPrice)}</span>
        </div>
        <button
          onClick={() => router.push("/shop/checkout")}
          className="w-full rounded-md bg-[var(--primary)] py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90"
        >
          Tiến hành thanh toán
        </button>
      </div>
    </div>
  );
}
