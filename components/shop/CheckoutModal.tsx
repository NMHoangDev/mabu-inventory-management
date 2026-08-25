"use client";

import { useState } from "react";
import { useCartStore, rememberOrder } from "@/store/shopCart";
import { fmtMoney } from "@/lib/storefront/format";
import { ZALO_URL } from "@/components/shop/constants";
import { X } from "@/components/shop/icons";

interface OrderSuccess {
  code: string;
  phone: string;
  total: number;
}

export default function CheckoutModal() {
  const { items, isCheckoutOpen, closeCheckout, totalPrice, clearCart } = useCartStore();

  const [form, setForm] = useState({ phone: "", name: "", address: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [orderSuccess, setOrderSuccess] = useState<OrderSuccess | null>(null);

  if (!isCheckoutOpen) return null;

  const total = totalPrice();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone || !form.name || !form.address) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/storefront/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          items: items.map((it) => ({ product_id: it.product_id, quantity: it.quantity })),
          payment_method: "cod",
          shipping_address: form.address,
          note: form.note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Đặt hàng thất bại.");
      rememberOrder({ code: data.order.code, phone: form.phone, createdAt: new Date().toISOString() });
      setOrderSuccess({ code: data.order.code, phone: form.phone, total: data.order.total });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đặt hàng thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (orderSuccess) {
      clearCart();
      setOrderSuccess(null);
      setForm({ phone: "", name: "", address: "", note: "" });
    }
    closeCheckout();
  };

  const handleMuaTiep = () => {
    clearCart();
    setOrderSuccess(null);
    setForm({ phone: "", name: "", address: "", note: "" });
    closeCheckout();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-shop-fade-in" onClick={handleClose} />

      <div className="relative w-full max-w-[440px] rounded-3xl bg-white p-6 shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-shop-text"
        >
          <X size={18} />
        </button>

        {!orderSuccess ? (
          <div>
            <div className="mb-6 text-center">
              <h2 className="text-[20px] font-black text-shop-text">Hãy để lại số điện thoại</h2>
              <p className="mt-1 text-[13px] text-shop-text-muted">Shop sẽ xác nhận qua zalo ạ</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="tel"
                name="phone"
                required
                value={form.phone}
                onChange={handleChange}
                placeholder="Số điện thoại *"
                className="h-11 w-full rounded-2xl border border-shop-border bg-white px-4 text-[14px] outline-none transition focus:border-shop-primary focus:ring-4 focus:ring-blue-500/10"
              />
              <input
                type="text"
                name="name"
                required
                value={form.name}
                onChange={handleChange}
                placeholder="Tên gọi *"
                className="h-11 w-full rounded-2xl border border-shop-border bg-white px-4 text-[14px] outline-none transition focus:border-shop-primary focus:ring-4 focus:ring-blue-500/10"
              />
              <input
                type="text"
                name="address"
                required
                value={form.address}
                onChange={handleChange}
                placeholder="Địa chỉ giao hàng *"
                className="h-11 w-full rounded-2xl border border-shop-border bg-white px-4 text-[14px] outline-none transition focus:border-shop-primary focus:ring-4 focus:ring-blue-500/10"
              />
              <textarea
                name="note"
                rows={2}
                value={form.note}
                onChange={handleChange}
                placeholder="Ghi chú cho sale"
                className="w-full resize-none rounded-2xl border border-shop-border bg-white px-4 py-3 text-[14px] outline-none transition focus:border-shop-primary focus:ring-4 focus:ring-blue-500/10"
              />

              {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 h-12 w-full rounded-2xl bg-shop-primary text-[15px] font-bold text-white shadow-lg shadow-blue-500/18 transition-all hover:bg-blue-600 hover:shadow-blue-500/25 active:scale-[0.98] disabled:opacity-70"
              >
                {submitting ? "Đang xử lý..." : `Hoàn tất - ${fmtMoney(total)}`}
              </button>
            </form>
          </div>
        ) : (
          <div>
            <div className="mb-4 text-center">
              <h2 className="text-[20px] font-black text-shop-text">Đặt hàng thành công</h2>
            </div>

            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-shop-primary bg-white text-shop-primary">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="h-7 w-7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
            </div>

            <div className="mb-5 text-center">
              <h3 className="text-[17px] font-black text-shop-text">Denfood đã nhận đơn</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-shop-text-muted">
                Nhân viên sẽ liên hệ xác nhận qua Zalo. <br />
                <span className="rounded-sm bg-[#F0F6FF] px-1.5 py-0.5 font-medium text-shop-primary">
                  Đơn hàng đã được gửi tới nhân viên Denfood.
                </span>
              </p>
            </div>

            <div className="mb-5 space-y-2.5 rounded-2xl border border-gray-100 bg-[#FAFAFA] p-4 text-[13.5px]">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-shop-text-muted">Mã đơn</span>
                <span className="font-bold text-shop-text">{orderSuccess.code}</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100/80 pt-2.5">
                <span className="text-[13px] text-shop-text-muted">Tổng đơn</span>
                <span className="font-bold text-shop-primary">{fmtMoney(orderSuccess.total)}</span>
              </div>
            </div>

            <div className="mb-4 flex gap-3">
              <a
                href={`/shop/don?code=${orderSuccess.code}&phone=${orderSuccess.phone}`}
                className="block flex-1 rounded-2xl border border-shop-border bg-white py-3 text-center text-[14px] font-bold text-shop-text transition-colors hover:bg-gray-50"
              >
                Xem đơn
              </a>
              <a
                href={ZALO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block flex-1 rounded-2xl bg-shop-primary py-3 text-center text-[14px] font-bold text-white shadow-lg shadow-blue-500/18 transition-colors hover:brightness-105"
              >
                Chat Zalo
              </a>
            </div>

            <button onClick={handleMuaTiep} className="mx-auto block py-1 text-[13px] font-semibold text-shop-text-muted transition-colors hover:text-shop-primary">
              Mua tiếp
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
