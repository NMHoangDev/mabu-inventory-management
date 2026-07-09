"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Package } from "lucide-react";
import { useCustomer } from "@/components/storefront/CustomerContext";
import { fmtMoney, fmtDate } from "@/lib/storefront/format";

interface OrderRow {
  id: string;
  code: string;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  total: number;
  created_at: string;
  items: Array<{ product_name: string; quantity: number }>;
}

const FULFILLMENT_LABEL: Record<string, string> = {
  unshipped: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  packing: "Đang đóng gói",
  shipping: "Đang giao",
  shipped: "Đã giao",
  returned: "Đã hoàn",
};

export default function AccountOrdersPage() {
  const router = useRouter();
  const { customer, loading: customerLoading } = useCustomer();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerLoading && !customer) router.replace("/shop/account/login?next=/shop/account/orders");
  }, [customerLoading, customer, router]);

  useEffect(() => {
    if (!customer) return;
    fetch("/api/storefront/orders")
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [customer]);

  if (customerLoading || loading || !customer) {
    return (
      <div className="flex justify-center py-20 text-[var(--muted-foreground)]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <Package className="h-10 w-10 text-[var(--muted-foreground)]" />
        <p className="text-[var(--muted-foreground)]">Bạn chưa có đơn hàng nào.</p>
        <Link href="/shop/products" className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90">
          Mua sắm ngay
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Đơn hàng của tôi</h1>
      <div className="space-y-3">
        {orders.map((o) => (
          <Link key={o.id} href={`/shop/account/orders/${o.id}`} className="panel block p-4 hover:shadow-elegant">
            <div className="flex items-center justify-between">
              <span className="font-medium">{o.code}</span>
              <span className="section-caption">{fmtDate(o.created_at)}</span>
            </div>
            <div className="mt-1 line-clamp-1 text-sm text-[var(--muted-foreground)]">
              {o.items.map((it) => `${it.product_name} x${it.quantity}`).join(", ")}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--accent-foreground)]">
                {o.status === "cancelled" ? "Đã huỷ" : o.status === "new" ? "Chờ xác nhận" : FULFILLMENT_LABEL[o.fulfillment_status] ?? o.fulfillment_status}
              </span>
              <span className="font-semibold text-[var(--primary)]">{fmtMoney(o.total)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
