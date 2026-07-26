"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";

interface ReturnableItemRow {
  order_item_id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string;
  unit: string;
  quantity: number;
  unit_price: number;
  already_returned: number;
  returnable_qty: number;
}

interface OrderHeader {
  id: string;
  code: string;
  customer_name: string;
  customer_phone: string;
  staff: string;
  total: number;
  created_at: string;
}

function parseQty(text: string, max: number): number {
  const n = Math.floor(Number(text.replace(/[^\d]/g, "")));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

export default function CreateOrderReturnPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<OrderHeader | null>(null);
  const [items, setItems] = useState<ReturnableItemRow[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/order-returns/returnable/${orderId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Không tải được đơn hàng.");
        if (!cancelled) {
          setOrder(data.order);
          setItems(data.items ?? []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Không tải được đơn hàng.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const totalRefund = useMemo(
    () =>
      items.reduce((s, it) => {
        const qty = quantities[it.order_item_id] ?? 0;
        return s + qty * it.unit_price;
      }, 0),
    [items, quantities]
  );

  const hasAnyLineSelected = Object.values(quantities).some((q) => q > 0);

  const handleSubmit = async () => {
    if (!hasAnyLineSelected) {
      setError("Chưa chọn số lượng trả cho sản phẩm nào.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const body = {
        order_id: orderId,
        reason,
        items: Object.entries(quantities)
          .filter(([, qty]) => qty > 0)
          .map(([order_item_id, quantity_returned]) => ({ order_item_id, quantity_returned })),
      };
      const res = await fetch("/api/order-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tạo được phiếu trả hàng.");
      router.push("/orders/returns");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được phiếu trả hàng.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4.5rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-[#005baf]" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4.5rem)] gap-3">
        <p className="text-sm text-[#404754]">{error || "Không tìm thấy đơn hàng."}</p>
        <button onClick={() => router.push("/orders/returns/new")} className="text-sm text-[#005baf] hover:underline">
          Quay lại chọn đơn hàng
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6 bg-slate-100">
      <header className="h-14 bg-white border-b px-6 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => router.push("/orders/returns/new")}
          className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại chọn đơn hàng
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-2 bg-[#005baf] text-white rounded hover:bg-[#005eb3] text-sm font-medium disabled:opacity-60 flex items-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Tạo phiếu trả hàng
        </button>
      </header>

      {error && (
        <div className="mx-6 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="bg-white rounded shadow-sm p-4 flex flex-wrap gap-6 text-sm">
          <div>
            <span className="text-[#404754]">Đơn hàng: </span>
            <span className="font-semibold text-[#0d1d29]">#{order.code}</span>
          </div>
          <div>
            <span className="text-[#404754]">Khách hàng: </span>
            <span className="font-semibold text-[#0d1d29]">{order.customer_name || "Khách lẻ"}</span>
          </div>
          <div>
            <span className="text-[#404754]">Nhân viên: </span>
            <span className="font-semibold text-[#0d1d29]">{order.staff || "—"}</span>
          </div>
        </div>

        <div className="bg-white rounded shadow-sm overflow-hidden">
          <div className="border-b border-[#c0c6d6] overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-[#ebf5ff]">
                  <th className="p-3 text-xs font-semibold text-[#404754] uppercase">Sản phẩm</th>
                  <th className="p-3 text-xs font-semibold text-[#404754] uppercase text-right">SL đã mua</th>
                  <th className="p-3 text-xs font-semibold text-[#404754] uppercase text-right">Đã trả trước đó</th>
                  <th className="p-3 text-xs font-semibold text-[#404754] uppercase text-right w-32">SL trả</th>
                  <th className="p-3 text-xs font-semibold text-[#404754] uppercase text-right">Đơn giá</th>
                  <th className="p-3 text-xs font-semibold text-[#404754] uppercase text-right">Thành tiền hoàn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c0c6d6]">
                {items.map((it) => {
                  const qty = quantities[it.order_item_id] ?? 0;
                  return (
                    <tr key={it.order_item_id}>
                      <td className="p-3">
                        <p className="text-sm text-[#0d1d29]">{it.product_name}</p>
                        <p className="text-xs text-[#404754]">
                          SKU: {it.product_sku || "—"} · {it.unit}
                        </p>
                      </td>
                      <td className="p-3 text-right text-sm">{it.quantity}</td>
                      <td className="p-3 text-right text-sm text-[#404754]">{it.already_returned}</td>
                      <td className="p-3 text-right">
                        <input
                          type="text"
                          disabled={it.returnable_qty === 0}
                          value={qty || ""}
                          placeholder="0"
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [it.order_item_id]: parseQty(e.target.value, it.returnable_qty),
                            }))
                          }
                          className="w-20 text-right p-1.5 border border-[#c0c6d6] rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none disabled:bg-[#f4f6f8] disabled:text-[#404754]"
                        />
                        <p className="text-[10px] text-[#404754] mt-0.5">tối đa {it.returnable_qty}</p>
                      </td>
                      <td className="p-3 text-right text-sm">{formatCurrencyVND(it.unit_price)}</td>
                      <td className="p-3 text-right text-sm font-semibold text-[#005baf]">
                        {formatCurrencyVND(qty * it.unit_price)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-4 flex justify-between items-center bg-[#fafbfc]">
            <span className="text-sm font-semibold text-[#0d1d29]">Tổng tiền hoàn</span>
            <span className="text-lg font-bold text-[#ba1a1a]">-{formatCurrencyVND(totalRefund)}</span>
          </div>
        </div>

        <div className="bg-white rounded shadow-sm p-4">
          <label className="block text-xs font-medium text-[#404754] mb-1">Lý do trả hàng</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full h-20 p-2 border border-[#c0c6d6] rounded text-sm resize-none focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
            placeholder="Ví dụ: khách đổi ý, hàng lỗi, giao nhầm sản phẩm..."
          />
        </div>
      </div>
    </div>
  );
}
