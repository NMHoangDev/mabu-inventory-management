"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Printer,
  AlertCircle,
  Scale
} from "lucide-react";

type StockCheckStatus = "draft" | "in_progress" | "balanced" | "cancelled";

interface StockCheckItem {
  id: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  system_quantity: number;
  actual_quantity: number;
  variance: number;
  variance_reason: string;
  note: string;
  stock_applied_at: string | null;
}

interface StockCheck {
  id: string;
  code: string;
  branch: string;
  staff: string;
  note: string;
  status: StockCheckStatus;
  total_items: number;
  matched_items: number;
  variance_items: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  items: StockCheckItem[];
}

const STATUS_META: Record<StockCheckStatus, { label: string; className: string }> = {
  draft: { label: "Nháp", className: "bg-slate-100 text-slate-600" },
  in_progress: { label: "Đang kiểm", className: "bg-orange-100 text-orange-700" },
  balanced: { label: "Đã cân bằng", className: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Đã hủy", className: "bg-red-100 text-red-700" }
};

const fmtNum = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

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

export default function StockCheckDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [sc, setSc] = useState<StockCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  const fetchData = () => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/stock-checks/${encodeURIComponent(id)}`)
      .then((r) => r.json().then((body: any) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) throw new Error(body?.error ?? "Không tải được phiếu kiểm hàng.");
        setSc(body as StockCheck);
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

  const totals = useMemo(() => {
    if (!sc) return { system: 0, actual: 0, variance: 0 };
    return sc.items.reduce(
      (acc, it) => ({
        system: acc.system + Number(it.system_quantity || 0),
        actual: acc.actual + Number(it.actual_quantity || 0),
        variance: acc.variance + Number(it.variance || 0)
      }),
      { system: 0, actual: 0, variance: 0 }
    );
  }, [sc]);

  const transitionStatus = async (next: StockCheckStatus, confirm?: string) => {
    if (!sc || busy) return;
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/stock-checks/${encodeURIComponent(sc.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextStatus: next })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body?.error ?? body?.message ?? "Không đổi được trạng thái.");
      }
      setFlash({ kind: "ok", message: body.message ?? "Đã cập nhật." });
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
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải phiếu kiểm hàng…
      </div>
    );
  }
  if (error || !sc) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error || "Không tìm thấy phiếu kiểm hàng."}
        <div className="mt-3">
          <Link href="/products/stock-checks" className="text-blue-600 hover:underline">
            ← Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }

  const statusMeta = STATUS_META[sc.status] ?? STATUS_META.draft;
  const appliedCount = sc.items.filter((it) => it.stock_applied_at).length;
  const isFinal = sc.status === "balanced" || sc.status === "cancelled";

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 lg:px-6">
      <div className="flex items-center justify-between">
        <Link
          href="/products/stock-checks"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" /> Danh sách phiếu kiểm hàng
        </Link>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{sc.code}</span>
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

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Mã phiếu kiểm" value={sc.code} />
          <Field label="Ngày tạo" value={formatDateOnly(sc.created_at)} />
          <Field
            label="Trạng thái"
            value={
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
            }
          />
          <Field label="Chi nhánh" value={sc.branch || "—"} />
          <Field label="Nhân viên kiểm" value={sc.staff || "—"} />
          <Field label="Số SKU kiểm" value={String(sc.total_items)} />
          <Field label="Khớp hệ thống" value={String(sc.matched_items)} />
          <Field
            label="Có chênh lệch"
            value={
              <span className={sc.variance_items > 0 ? "text-amber-700 font-semibold" : ""}>
                {sc.variance_items}
              </span>
            }
          />
          <Field
            label="Đã áp vào tồn kho"
            value={
              <span className={appliedCount === sc.items.length && sc.items.length > 0 ? "text-emerald-700" : "text-slate-500"}>
                {appliedCount}/{sc.items.length}
              </span>
            }
          />
        </div>
        {sc.note ? (
          <div className="mt-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">Ghi chú: {sc.note}</div>
        ) : null}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        {sc.items.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">Phiếu chưa có sản phẩm.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">STT</th>
                  <th className="px-3 py-2.5">Ảnh</th>
                  <th className="px-3 py-2.5">Mã SKU</th>
                  <th className="px-3 py-2.5">Tên sản phẩm</th>
                  <th className="px-3 py-2.5">Đơn vị</th>
                  <th className="px-3 py-2.5 text-right">Tồn hệ thống</th>
                  <th className="px-3 py-2.5 text-right">Tồn thực tế</th>
                  <th className="px-3 py-2.5 text-right">Chênh lệch</th>
                  <th className="px-3 py-2.5">Lý do lệch</th>
                  <th className="px-3 py-2.5 text-center">Áp tồn kho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sc.items.map((it, idx) => (
                  <tr key={it.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2">
                      {it.image_url ? (
                        <img src={it.image_url} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">—</div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{it.sku || "—"}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{it.product_name}</td>
                    <td className="px-3 py-2 text-slate-600">{it.unit || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum.format(it.system_quantity)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum.format(it.actual_quantity)}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium tabular-nums ${
                        it.variance > 0 ? "text-emerald-700" : it.variance < 0 ? "text-red-600" : "text-slate-500"
                      }`}
                    >
                      {it.variance > 0 ? "+" : ""}
                      {fmtNum.format(it.variance)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{it.variance_reason || "—"}</td>
                    <td className="px-3 py-2 text-center text-xs">
                      {it.variance === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : it.stock_applied_at ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Đã áp
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                          Chưa áp
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
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{fmtNum.format(totals.system)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{fmtNum.format(totals.actual)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                    {totals.variance > 0 ? "+" : ""}
                    {fmtNum.format(totals.variance)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={() => transitionStatus("cancelled", "Hủy phiếu kiểm hàng này?")}
          disabled={busy || isFinal}
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

        <div className="ml-auto">
          {!isFinal ? (
            <button
              type="button"
              onClick={() =>
                transitionStatus(
                  "balanced",
                  "Cân bằng kiểm kê sẽ áp toàn bộ chênh lệch vào tồn kho thật — không thể hoàn tác. Tiếp tục?"
                )
              }
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
              Cân bằng kiểm kê
            </button>
          ) : (
            <span className="text-xs text-slate-500">
              {sc.status === "balanced" ? "Đã cân bằng — không thể sửa lại, tạo phiếu mới nếu cần." : "Phiếu đã hủy."}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-slate-900">{value}</div>
    </div>
  );
}
