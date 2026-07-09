"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { fmtMoney } from "@/lib/storefront/format";

interface OrderSummary {
  code: string;
  total: number;
  payment_method: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  cod: "Thanh toán khi nhận hàng (COD)",
  bank_transfer: "Chuyển khoản",
  card: "Quẹt thẻ khi giao hàng",
  cash: "Tiền mặt",
};

export default function CheckoutSuccessPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/storefront/orders/${params.id}`)
      .then((r) => r.json())
      .then((d) => setOrder(d.order ?? null))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [params.id]);

  return (
    <div className="mx-auto max-w-md space-y-5 py-12 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-[var(--success)]" />
      <h1 className="text-xl font-semibold">Đặt hàng thành công!</h1>
      {loading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
      ) : order ? (
        <div className="panel space-y-2 p-5 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--muted-foreground)]">Mã đơn hàng</span>
            <span className="font-medium">{order.code}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--muted-foreground)]">Thanh toán</span>
            <span className="font-medium">{PAYMENT_LABEL[order.payment_method] ?? order.payment_method}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <span>Tổng tiền</span>
            <span className="text-[var(--primary)]">{fmtMoney(order.total)}</span>
          </div>
        </div>
      ) : null}
      <p className="text-sm text-[var(--muted-foreground)]">
        Chúng tôi sẽ liên hệ xác nhận đơn hàng trong thời gian sớm nhất.
      </p>
      <div className="flex justify-center gap-3">
        <Link href="/shop/account/orders" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-[var(--accent)]">
          Xem đơn hàng của tôi
        </Link>
        <Link href="/shop/products" className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90">
          Tiếp tục mua sắm
        </Link>
      </div>
    </div>
  );
}
