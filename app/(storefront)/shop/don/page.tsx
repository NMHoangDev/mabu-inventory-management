"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package } from "@/components/shop/icons";
import { fmtMoney } from "@/lib/storefront/format";
import { ZALO_URL } from "@/components/shop/constants";
import { getRecentOrders, type RecentOrderRef } from "@/store/shopCart";

interface OrderDetail {
  code: string;
  customer_name: string;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  total: number;
  address: string;
  created_at: string;
  items: { product_name: string; quantity: number; unit_price: number; line_total: number }[];
}

const FULFILLMENT_STEPS = [
  { key: "unshipped", title: "Đã nhận đơn", desc: "Denfood đã nhận thông tin" },
  { key: "confirmed", title: "Gọi xác nhận", desc: "Nhân viên liên hệ qua Zalo" },
  { key: "packing", title: "Chốt đơn", desc: "Đơn đang được đóng gói" },
  { key: "shipping", title: "Đang giao", desc: "Để ý điện thoại nhận hàng" },
  { key: "shipped", title: "Hoàn tất", desc: "Cảm ơn bạn ủng hộ Denfood" },
];

function stepIndex(fulfillmentStatus: string): number {
  const i = FULFILLMENT_STEPS.findIndex((s) => s.key === fulfillmentStatus);
  return i === -1 ? 0 : i;
}

function formatOrderDate(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    return `${hh}:${mm} ${day}-${mon}`;
  } catch {
    return "";
  }
}

async function fetchOrder(code: string, phone: string): Promise<OrderDetail | null> {
  const res = await fetch(`/api/storefront/orders/lookup?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(phone)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.order ?? null;
}

function OrderTrackerContent() {
  const searchParams = useSearchParams();

  const [recent, setRecent] = useState<RecentOrderRef[]>([]);
  const [lookupCode, setLookupCode] = useState(searchParams.get("code") ?? "");
  const [lookupPhone, setLookupPhone] = useState((searchParams.get("phone") ?? "").slice(-4));
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(false);

  const runLookup = useCallback(async (code: string, phone: string) => {
    if (!code.trim() || !phone.trim()) return;
    setLoading(true);
    setErrorMsg(false);
    const found = await fetchOrder(code.trim(), phone.trim());
    setLoading(false);
    if (found) setSelectedOrder(found);
    else setErrorMsg(true);
  }, []);

  useEffect(() => {
    const refs = getRecentOrders();
    setRecent(refs);
    const codeUrl = searchParams.get("code");
    const phoneUrl = searchParams.get("phone");
    if (codeUrl && phoneUrl) {
      void runLookup(codeUrl, phoneUrl.slice(-4));
    } else if (refs.length > 0) {
      void runLookup(refs[0].code, refs[0].phone.slice(-4));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runLookup(lookupCode, lookupPhone);
  };

  const isLookupActive = lookupCode.trim().length > 0 && lookupPhone.trim().length > 0;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/shop" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-100 bg-white text-shop-text shadow-sm transition-all hover:scale-105 hover:bg-slate-50">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-lg font-black tracking-tight text-shop-text">Đơn của tôi</h1>
          </div>
          <Link href="/shop" className="inline-flex h-10 items-center justify-center rounded-full bg-shop-primary px-5 text-xs font-bold text-white shadow-md transition-all hover:bg-blue-600">
            Đặt thêm
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <div className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-[13px] font-black uppercase tracking-wider text-slate-400">Tra cứu đơn</h2>
            <form onSubmit={handleLookupSubmit} className="space-y-3">
              <input
                type="text"
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value)}
                placeholder="Mã đơn (vd DH000123)"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[13.5px] outline-none transition focus:border-shop-primary focus:ring-4 focus:ring-blue-500/10"
              />
              <input
                type="text"
                value={lookupPhone}
                onChange={(e) => setLookupPhone(e.target.value)}
                placeholder="4 số cuối SĐT"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[13.5px] outline-none transition focus:border-shop-primary focus:ring-4 focus:ring-blue-500/10"
              />
              <button
                type="submit"
                disabled={!isLookupActive || loading}
                className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-bold shadow-sm transition-all ${
                  isLookupActive ? "cursor-pointer bg-shop-primary text-white hover:bg-blue-600" : "cursor-not-allowed bg-slate-100 text-slate-400 shadow-none"
                }`}
              >
                {loading ? "Đang tra..." : "Tra cứu"}
              </button>
            </form>

            {errorMsg && (
              <div className="rounded-2xl border border-[#FFE3E3] bg-[#FFF5F5] p-4 text-center">
                <p className="text-[12.5px] font-semibold leading-relaxed text-[#E53E3E]">
                  Không tìm thấy đơn. Kiểm tra lại mã đơn và số điện thoại.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="px-2 text-[13px] font-black uppercase tracking-wider text-slate-400">Đơn gần đây</h2>
            {recent.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-6 text-center">
                <p className="text-[12.5px] leading-relaxed text-slate-400">
                  Bạn chưa có đơn nào trên thiết bị này. Đặt 1 đơn từ trang chủ, mã đơn sẽ tự lưu lại để xem ở đây.
                </p>
              </div>
            ) : (
              <div className="max-h-[46vh] space-y-2.5 overflow-y-auto pr-1 lg:max-h-[58vh]">
                {recent.map((ref) => {
                  const isActive = selectedOrder?.code === ref.code;
                  return (
                    <div
                      key={ref.code}
                      onClick={() => {
                        setLookupCode(ref.code);
                        setLookupPhone(ref.phone.slice(-4));
                        void runLookup(ref.code, ref.phone.slice(-4));
                      }}
                      className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5 ${
                        isActive ? "border-blue-200 bg-blue-50/60 shadow-sm" : "border-slate-100/80 bg-white shadow-sm hover:border-blue-300/40"
                      }`}
                    >
                      <div className="space-y-1">
                        <span className="text-[14px] font-black text-shop-text">{ref.code}</span>
                        <p className="text-[11.5px] font-semibold text-slate-400">{formatOrderDate(ref.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div>
          {selectedOrder ? (
            <div className="space-y-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:p-7">
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <h2 className="text-base font-black tracking-tight text-shop-text">MÃ ĐƠN {selectedOrder.code}</h2>
                  <p className="text-xs font-semibold text-slate-400">{formatOrderDate(selectedOrder.created_at)}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-shop-primary">
                  ● {selectedOrder.status === "cancelled" ? "Đã huỷ" : FULFILLMENT_STEPS[stepIndex(selectedOrder.fulfillment_status)].title}
                </span>
              </div>

              {selectedOrder.status === "cancelled" ? (
                <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-600">Đơn hàng này đã bị huỷ.</p>
              ) : (
                <div className="relative space-y-6 pl-7">
                  <div className="absolute bottom-2.5 left-[9px] top-2.5 w-0.5 bg-slate-100" />
                  {FULFILLMENT_STEPS.map((step, idx) => {
                    const current = stepIndex(selectedOrder.fulfillment_status);
                    const isDone = current >= idx;
                    return (
                      <div key={step.key} className="relative">
                        <div
                          className={`absolute -left-[23px] top-1 flex size-5 items-center justify-center rounded-full border transition-all duration-300 ${
                            isDone ? "border-shop-primary bg-shop-primary text-white" : "border-slate-200 bg-white text-slate-400"
                          }`}
                        >
                          {isDone ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                              <path
                                fillRule="evenodd"
                                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <div className="size-1.5 rounded-full bg-slate-200" />
                          )}
                        </div>
                        <div>
                          <p className={`text-[13.5px] font-bold ${isDone ? "text-shop-text" : "text-slate-400"}`}>{step.title}</p>
                          <p className="mt-0.5 text-[11.5px] font-medium leading-snug text-slate-400">{step.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-4 border-t border-dashed border-slate-100 pt-5">
                <div className="max-h-[30vh] space-y-2.5 overflow-y-auto pr-1">
                  {selectedOrder.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 text-[13px]">
                      <span className="font-semibold leading-relaxed text-shop-text">
                        {item.product_name} <span className="ml-1 text-xs font-bold text-slate-400">x{item.quantity}</span>
                      </span>
                      <span className="whitespace-nowrap font-bold text-shop-text">{fmtMoney(item.line_total)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3 text-[13px] text-shop-text-muted">
                  <span>Tên gọi</span>
                  <span className="font-bold text-shop-text">{selectedOrder.customer_name}</span>
                </div>
                {selectedOrder.address && (
                  <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-2 text-[13px] text-shop-text-muted">
                    <span className="shrink-0">Địa chỉ</span>
                    <span className="max-w-[245px] truncate font-semibold text-shop-text">{selectedOrder.address}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-dashed border-slate-100 pt-5">
                <span className="text-[13px] font-black uppercase tracking-wide text-shop-text">Tổng đơn</span>
                <span className="text-2xl font-black tracking-tight text-shop-primary">{fmtMoney(selectedOrder.total)}</span>
              </div>

              <div className="flex gap-3 border-t border-slate-100 pt-5">
                <Link href="/shop" className="flex-1 rounded-2xl border border-slate-200 bg-white py-3.5 text-center text-[14px] font-bold text-shop-text transition-all hover:bg-slate-50">
                  Mua thêm
                </Link>
                <a
                  href={ZALO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-2xl bg-shop-primary py-3.5 text-center text-[14px] font-bold text-white shadow-lg transition-all hover:bg-blue-600"
                >
                  💬 Chat Zalo
                </a>
              </div>
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-200 p-6 text-center text-shop-text-muted">
              <Package size={32} />
              <p className="text-sm font-semibold">Chọn hoặc nhập mã đơn hàng bên trái để theo dõi chi tiết</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OrderTrackerPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm font-semibold text-shop-text-muted">Đang tải thông tin...</div>}>
      <OrderTrackerContent />
    </Suspense>
  );
}
