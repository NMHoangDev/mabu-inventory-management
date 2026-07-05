"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Printer,
  RotateCcw,
  AlertCircle,
  ExternalLink,
  Wallet
} from "lucide-react";

type ReceiptStatus = "pending" | "in_progress" | "completed" | "cancelled";

interface GoodsReceiptItem {
  id: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  ordered_qty: number;
  received_qty: number;
  unit_cost: number;
  discount: number;
  line_total: number;
  position: number;
  note: string;
  stock_added_at: string | null;
}

interface GoodsReceipt {
  id: string;
  code: string;
  supplier_name: string;
  supplier_phone: string;
  purchase_order_id: string | null;
  purchase_order_code: string;
  branch: string;
  staff: string;
  received_at: string;
  expected_date: string | null;
  note: string;
  receipt_status: ReceiptStatus;
  order_status: ReceiptStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total_cost: number;
  total_quantity: number;
  paid: number;
  payment_method: string;
  items: GoodsReceiptItem[];
}

const STATUS_META: Record<ReceiptStatus, { label: string; className: string }> = {
  pending: { label: "Chờ nhận hàng", className: "bg-slate-100 text-slate-600" },
  in_progress: { label: "Đang nhập hàng", className: "bg-orange-100 text-orange-700" },
  completed: { label: "Hoàn thành", className: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Đã hủy", className: "bg-red-100 text-red-700" }
};

const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return "—";
  }
}

export default function GoodsReceiptDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";

  const [gr, setGr] = useState<GoodsReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  const fetchData = () => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/goods-receipts/${encodeURIComponent(id)}`)
      .then((r) => r.json().then((body: any) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) throw new Error(body?.error ?? "Không tải được đơn nhập hàng.");
        setGr(body as GoodsReceipt);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi mạng."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    const cleanup = fetchData();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const totalReceived = useMemo(
    () => gr?.items.reduce((s, it) => s + Number(it.received_qty || 0), 0) ?? 0,
    [gr]
  );
  const totalOrdered = useMemo(
    () => gr?.items.reduce((s, it) => s + Number(it.ordered_qty || 0), 0) ?? 0,
    [gr]
  );
  const totalCost = useMemo(
    () => gr?.items.reduce((s, it) => s + Number(it.line_total || 0), 0) ?? 0,
    [gr]
  );

  const transitionStatus = async (next: ReceiptStatus, confirm?: string) => {
    if (!gr || busy) return;
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/goods-receipts/${encodeURIComponent(gr.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextStatus: next })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body?.error ?? body?.message ?? "Không đổi được trạng thái.");
      }
      setFlash({
        kind: "ok",
        message:
          next === "completed"
            ? "Thanh toán hoàn thành. Đã cộng tồn kho."
            : next === "cancelled"
              ? "Đã hủy đơn nhập hàng."
              : `Đã chuyển trạng thái: ${next}`
      });
      fetchData();
    } catch (e) {
      setFlash({ kind: "error", message: e instanceof Error ? e.message : "Lỗi không xác định." });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải đơn nhập hàng…
      </div>
    );
  }
  if (error || !gr) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error || "Không tìm thấy đơn nhập hàng."}
        <div className="mt-3">
          <Link href="/products/goods-receipts" className="text-blue-600 hover:underline">
            ← Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }

  const statusMeta = STATUS_META[gr.receipt_status] ?? STATUS_META.pending;
  const orderStatusMeta = STATUS_META[gr.order_status] ?? STATUS_META.pending;
  const stockAddedCount = gr.items.filter((it) => it.stock_added_at).length;
  const allStockAdded = gr.items.length > 0 && stockAddedCount === gr.items.length;

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 lg:px-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/products/goods-receipts"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" /> Danh sách đơn nhập hàng
        </Link>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{gr.code}</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${statusMeta.className}`}>
            {statusMeta.label}
          </span>
        </div>
      </div>

      {flash ? (
        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            flash.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {flash.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {flash.message}
        </div>
      ) : null}

      {/* Header info */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Mã đơn nhập" value={gr.code} />
          <Field label="Ngày nhập" value={formatDateOnly(gr.received_at)} />
          <Field
            label="Trạng thái"
            value={
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
            }
          />
          <Field
            label="Trạng thái nhập"
            value={
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${orderStatusMeta.className}`}>
                {orderStatusMeta.label}
              </span>
            }
          />
          <Field label="Nhà cung cấp" value={gr.supplier_name || "—"} />
          <Field label="Chi nhánh" value={gr.branch || "—"} />
          <Field label="Nhân viên tạo" value={gr.staff || "—"} />
          <Field label="Chính sách nhập" value="Theo đơn đặt hàng" />
          <Field
            label="Tham chiếu"
            value={
              gr.purchase_order_id ? (
                <Link
                  href={`/products/purchase-orders/${gr.purchase_order_id}`}
                  className="inline-flex items-center gap-1 font-mono text-blue-600 hover:underline"
                >
                  {gr.purchase_order_code || "Xem đơn"} <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                "—"
              )
            }
          />
          <Field label="Công nợ" value={fmtMoney.format(gr.total_cost)} suffix=" đ" highlight />
          <Field label="Tổng đơn nhập" value={fmtMoney.format(totalCost)} suffix=" đ" highlight />
          <Field label="Trả hàng" value="0" suffix=" đ" />
          <Field label="Đã thanh toán" value={fmtMoney.format(gr.paid)} suffix=" đ" />
          <Field
            label="Còn lại"
            value={fmtMoney.format(Math.max(0, gr.total_cost - gr.paid))}
            suffix=" đ"
          />
          <Field
            label="Tồn kho"
            value={
              <span className={allStockAdded ? "text-emerald-700" : "text-slate-500"}>
                {allStockAdded
                  ? `Đã cộng (${stockAddedCount}/${gr.items.length})`
                  : `Chưa cộng (${stockAddedCount}/${gr.items.length})`}
              </span>
            }
          />
        </div>
      </div>

      {/* Items table */}
      <div className="rounded-lg border border-slate-200 bg-white">
        {gr.items.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">Đơn chưa có sản phẩm.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">STT</th>
                  <th className="px-3 py-2.5">Ảnh</th>
                  <th className="px-3 py-2.5">Mã sản phẩm</th>
                  <th className="px-3 py-2.5">Tên sản phẩm</th>
                  <th className="px-3 py-2.5">Đơn vị</th>
                  <th className="px-3 py-2.5 text-right">SL đặt</th>
                  <th className="px-3 py-2.5 text-right">SL nhập</th>
                  <th className="px-3 py-2.5 text-right">Đơn giá</th>
                  <th className="px-3 py-2.5 text-right">Chiết khấu</th>
                  <th className="px-3 py-2.5 text-right">Thành tiền</th>
                  <th className="px-3 py-2.5 text-center">Tồn kho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gr.items.map((it, idx) => (
                  <tr key={it.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2">
                      {it.image_url ? (
                        <img src={it.image_url} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
                          —
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{it.sku || "—"}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{it.product_name}</td>
                    <td className="px-3 py-2 text-slate-600">{it.unit || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(it.ordered_qty).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(it.received_qty).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMoney.format(Number(it.unit_cost))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMoney.format(Number(it.discount) || 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {fmtMoney.format(Number(it.line_total))}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {it.stock_added_at ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Đã cộng
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                          Chưa cộng
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/50">
                  <td colSpan={5} className="px-3 py-2 text-right font-semibold text-slate-700">
                    Tổng cộng
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                    {totalOrdered.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                    {totalReceived.toLocaleString("vi-VN")}
                  </td>
                  <td colSpan={2}></td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                    {fmtMoney.format(totalCost)} đ
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={() =>
            transitionStatus(
              "cancelled",
              gr.receipt_status === "completed"
                ? "Hủy đơn đã hoàn thành sẽ hoàn lại tồn kho. Tiếp tục?"
                : "Hủy đơn nhập hàng này?"
            )
          }
          disabled={busy || gr.receipt_status === "cancelled"}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" /> In
        </button>
        {gr.receipt_status !== "completed" ? (
          <button
            type="button"
            onClick={() => transitionStatus("completed")}
            disabled={busy}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Thanh toán hoàn thành
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              transitionStatus(
                "pending",
                "Chuyển về Chờ nhận hàng sẽ hoàn lại tồn kho đã cộng. Tiếp tục?"
              )
            }
            disabled={busy}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" /> Hoàn lại "Chờ nhận hàng"
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  highlight = false,
  suffix = ""
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm ${highlight ? "font-semibold text-blue-700" : "text-slate-900"}`}>
        {value}
        {suffix ? <span className="ml-0.5 text-xs text-slate-500">{suffix}</span> : null}
      </div>
    </div>
  );
}
