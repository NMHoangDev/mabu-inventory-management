"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useCart } from "@/components/storefront/CartContext";
import { useCustomer } from "@/components/storefront/CustomerContext";
import { fmtMoney } from "@/lib/storefront/format";

const PAYMENT_METHODS: { value: "cod" | "bank_transfer" | "card"; label: string; hint: string }[] = [
  { value: "cod", label: "Thanh toán khi nhận hàng (COD)", hint: "Trả tiền mặt cho người giao hàng." },
  { value: "bank_transfer", label: "Chuyển khoản", hint: "Nhân viên sẽ liên hệ xác nhận sau khi chuyển khoản." },
  { value: "card", label: "Quẹt thẻ khi giao hàng", hint: "Thanh toán bằng thẻ khi nhận hàng." },
];

export default function CheckoutPage() {
  const router = useRouter();
  const { items, totalPrice, clear } = useCart();
  const { customer, loading: customerLoading } = useCustomer();
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "bank_transfer" | "card">("cod");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (customerLoading) {
    return (
      <div className="flex justify-center py-20 text-[var(--muted-foreground)]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <p className="text-[var(--muted-foreground)]">Vui lòng đăng nhập để tiến hành đặt hàng.</p>
        <Link
          href="/shop/account/login?next=/shop/checkout"
          className="inline-block rounded-md bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90"
        >
          Đăng nhập
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="py-20 text-center text-[var(--muted-foreground)]">Giỏ hàng đang trống, không thể thanh toán.</p>;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/storefront/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((it) => ({ product_id: it.product_id, quantity: it.quantity })),
          payment_method: paymentMethod,
          shipping_address: address,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Đặt hàng thất bại.");
      clear();
      router.push(`/shop/checkout/success/${data.order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đặt hàng thất bại.");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="space-y-4 md:col-span-2">
        <div className="panel space-y-3 p-5">
          <h2 className="section-title text-base">Thông tin giao hàng</h2>
          <div className="text-sm">
            <span className="font-medium">{customer.name}</span> — {customer.phone}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Địa chỉ giao hàng <span className="text-[var(--destructive)]">*</span>
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành..."
              className="field resize-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Ghi chú (không bắt buộc)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Ví dụ: giao giờ hành chính, gọi trước khi giao..."
              className="field resize-none"
            />
          </div>
        </div>

        <div className="panel space-y-2 p-5">
          <h2 className="section-title text-base">Phương thức thanh toán</h2>
          {PAYMENT_METHODS.map((m) => (
            <label
              key={m.value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${paymentMethod === m.value ? "border-[var(--primary)] bg-[var(--accent)]" : ""}`}
            >
              <input
                type="radio"
                name="payment_method"
                checked={paymentMethod === m.value}
                onChange={() => setPaymentMethod(m.value)}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">{m.label}</div>
                <div className="section-caption">{m.hint}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="panel h-fit space-y-4 p-5">
        <h2 className="section-title text-base">Đơn hàng ({items.length} sản phẩm)</h2>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {items.map((it) => (
            <div key={it.product_id} className="flex justify-between text-sm">
              <span className="line-clamp-1 flex-1 pr-2">
                {it.name} <span className="text-[var(--muted-foreground)]">x{it.quantity}</span>
              </span>
              <span className="shrink-0 tabular-nums">{fmtMoney(it.price * it.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t pt-3 text-base font-semibold">
          <span>Tổng cộng</span>
          <span className="text-[var(--primary)]">{fmtMoney(totalPrice)}</span>
        </div>
        {error && <div className="rounded-md bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">{error}</div>}
        <button
          onClick={handleSubmit}
          disabled={submitting || !address.trim()}
          className="w-full rounded-md bg-[var(--primary)] py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Đang xử lý..." : "Đặt hàng"}
        </button>
      </div>
    </div>
  );
}
