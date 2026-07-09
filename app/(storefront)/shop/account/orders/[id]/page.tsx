"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { useCustomer } from "@/components/storefront/CustomerContext";
import { fmtMoney, fmtDate } from "@/lib/storefront/format";

interface OrderItem {
  id: string;
  product_name: string;
  product_sku: string;
  unit: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface OrderDetail {
  id: string;
  code: string;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  payment_method: string;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  note: string;
  created_at: string;
  items: OrderItem[];
}

const STEPS = [
  { key: "confirmed", label: "Đã xác nhận" },
  { key: "packing", label: "Đang đóng gói" },
  { key: "shipping", label: "Đang giao hàng" },
  { key: "shipped", label: "Đã giao thành công" },
];

const PAYMENT_LABEL: Record<string, string> = {
  cod: "Thanh toán khi nhận hàng (COD)",
  bank_transfer: "Chuyển khoản",
  card: "Quẹt thẻ khi giao hàng",
  cash: "Tiền mặt",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Chưa thanh toán",
  partial: "Đã thanh toán 1 phần",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
};

export default function AccountOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { customer, loading: customerLoading } = useCustomer();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!customerLoading && !customer) router.replace(`/shop/account/login?next=/shop/account/orders/${params.id}`);
  }, [customerLoading, customer, router, params.id]);

  useEffect(() => {
    if (!customer) return;
    fetch(`/api/storefront/orders/${params.id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Không tìm thấy đơn hàng.");
        setOrder(data.order);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Đã xảy ra lỗi."))
      .finally(() => setLoading(false));
  }, [customer, params.id]);

  if (customerLoading || loading || !customer) {
    return (
      <div className="flex justify-center py-20 text-[var(--muted-foreground)]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (error || !order) {
    return <p className="py-20 text-center text-[var(--muted-foreground)]">{error || "Không tìm thấy đơn hàng."}</p>;
  }

  const currentStepIndex = STEPS.findIndex((s) => s.key === order.fulfillment_status);
  const isCancelled = order.status === "cancelled";
  const isPending = order.status === "new";
  const isReturned = order.fulfillment_status === "returned";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/shop/account/orders" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]">
        <ArrowLeft className="h-4 w-4" /> Quay lại đơn hàng
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Đơn hàng {order.code}</h1>
        <span className="section-caption">{fmtDate(order.created_at)}</span>
      </div>

      <div className="panel p-5">
        {isCancelled ? (
          <div className="rounded-md bg-[var(--destructive)]/10 px-4 py-3 text-sm font-medium text-[var(--destructive)]">
            Đơn hàng đã bị huỷ.
          </div>
        ) : isPending ? (
          <div className="rounded-md bg-[var(--warning-bg)] px-4 py-3 text-sm font-medium text-[var(--warning-foreground)]">
            Đơn hàng đang chờ xác nhận từ cửa hàng.
          </div>
        ) : isReturned ? (
          <div className="rounded-md bg-[var(--muted)] px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">
            Đơn hàng đã được hoàn trả.
          </div>
        ) : (
          <div className="space-y-4">
            {STEPS.map((step, i) => {
              const done = i <= currentStepIndex;
              return (
                <div key={step.key} className="flex items-center gap-3">
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--success)]" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-[var(--border)]" />
                  )}
                  <span className={done ? "font-medium" : "text-[var(--muted-foreground)]"}>{step.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel divide-y p-0">
        {order.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="line-clamp-1 text-sm font-medium">{it.product_name}</div>
              <div className="section-caption">
                {fmtMoney(it.unit_price)} x {it.quantity} {it.unit}
              </div>
            </div>
            <div className="shrink-0 font-semibold">{fmtMoney(it.line_total)}</div>
          </div>
        ))}
      </div>

      <div className="panel space-y-2 p-5">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--muted-foreground)]">Tạm tính</span>
          <span>{fmtMoney(order.subtotal)}</span>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-[var(--muted-foreground)]">Giảm giá</span>
            <span>-{fmtMoney(order.discount)}</span>
          </div>
        )}
        {order.shipping_fee > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-[var(--muted-foreground)]">Phí vận chuyển</span>
            <span>{fmtMoney(order.shipping_fee)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-2 text-base font-semibold">
          <span>Tổng cộng</span>
          <span className="text-[var(--primary)]">{fmtMoney(order.total)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--muted-foreground)]">Phương thức thanh toán</span>
          <span>{PAYMENT_LABEL[order.payment_method] ?? order.payment_method}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--muted-foreground)]">Trạng thái thanh toán</span>
          <span>{PAYMENT_STATUS_LABEL[order.payment_status] ?? order.payment_status}</span>
        </div>
        {order.note && (
          <div className="border-t pt-2 text-sm">
            <span className="text-[var(--muted-foreground)]">Ghi chú: </span>
            <span className="whitespace-pre-line">{order.note}</span>
          </div>
        )}
      </div>
    </div>
  );
}
