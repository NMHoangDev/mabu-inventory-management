"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  Loader2,
  Trash2,
  Truck,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ExternalLink,
  Pencil,
  Search,
  Plus,
  X,
  Package
} from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";
import { PageGuard } from "@/components/auth/PageGuard";

interface PurchaseOrderItem {
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
}

interface PurchaseOrder {
  id: string;
  code: string;
  supplier_name: string;
  supplier_phone: string;
  branch: string;
  staff: string;
  expected_date: string | null;
  status: "draft" | "pending" | "partial" | "completed" | "cancelled";
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  received_qty?: number;
  created_at: string;
  invoice_document_id: string | null;
  items: PurchaseOrderItem[];
  linked_goods_receipts?: Array<{ id: string; code: string; receipt_status: string }>;
}

type PurchaseOrderStatus = PurchaseOrder["status"];
type TabKey = "info" | "receiving" | "completed";

const STATUS_META: Record<PurchaseOrderStatus, { label: string; className: string }> = {
  draft: { label: "Nháp", className: "bg-slate-100 text-slate-600" },
  pending: { label: "Đang giao dịch", className: "bg-blue-100 text-blue-700" },
  partial: { label: "Nhập một phần", className: "bg-orange-100 text-orange-700" },
  completed: { label: "Hoàn thành", className: "bg-green-100 text-green-700" },
  cancelled: { label: "Đã hủy", className: "bg-red-100 text-red-700" }
};

const fmtDate = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

interface ProductHit {
  id: string;
  sku: string;
  name: string;
  status: string;
  image_url: string;
  units: string;
  default_cost: number;
}

// Bản nháp đang sửa — backend delete+reinsert toàn bộ items khi lưu (xem
// updatePurchaseOrder ở lib/purchase-orders/repository.ts) nên rowKey chỉ
// cần để React key, không cần khớp id thật.
interface DraftItem {
  rowKey: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  ordered_qty: number;
  received_qty: number;
  unit_cost: number;
  discount: number;
  note: string;
}

function parseNum(text: string): number {
  const v = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

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

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("info");
  const [creatingGR, setCreatingGR] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  const fetchOrder = async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/purchase-orders/${encodeURIComponent(id)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Không tải được đơn đặt hàng.");
      setOrder(body as PurchaseOrder);
      return body as PurchaseOrder;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi mạng.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const totalReceived = useMemo(
    () => order?.items?.reduce((s, it) => s + (Number(it.received_qty) || 0), 0) ?? 0,
    [order]
  );
  const totalOrdered = useMemo(
    () => order?.items?.reduce((s, it) => s + (Number(it.ordered_qty) || 0), 0) ?? 0,
    [order]
  );
  const totalCost = useMemo(
    () => order?.items?.reduce((s, it) => s + (Number(it.line_total) || 0), 0) ?? 0,
    [order]
  );

  const linkedGR = order?.linked_goods_receipts ?? [];
  const hasActiveGR = linkedGR.some(
    (g) => g.receipt_status === "pending" || g.receipt_status === "in_progress"
  );
  // Khoá sửa sản phẩm nếu ĐÃ có bất kỳ phiếu nhập hàng nào liên kết (kể cả đã
  // huỷ/hoàn thành) — mirror đúng điều kiện chặn ở updatePurchaseOrder
  // (lib/purchase-orders/repository.ts) để nút không bật lên rồi lưu lại 409.
  const itemsLocked = linkedGR.length > 0;

  // ── Sửa sản phẩm trong đơn (thêm/sửa/xoá) — đôi khi nhập nhầm cần chỉnh
  // tay. CHỈ cho phép khi chưa có phiếu nhập hàng liên kết (itemsLocked).
  const [editMode, setEditMode] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [savingItems, setSavingItems] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductHit[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const productBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!productQuery.trim()) {
      setProductResults([]);
      return;
    }
    let cancelled = false;
    setProductLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/purchase-orders/products-search?q=${encodeURIComponent(productQuery)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setProductResults(Array.isArray(d) ? d : []);
        })
        .catch(() => {
          if (!cancelled) setProductResults([]);
        })
        .finally(() => {
          if (!cancelled) setProductLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [productQuery]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (productBoxRef.current && !productBoxRef.current.contains(e.target as Node)) {
        setProductResults([]);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function enterEditMode() {
    if (!order) return;
    setDraftItems(
      order.items.map((it) => ({
        rowKey: it.id,
        product_id: it.product_id,
        sku: it.sku,
        product_name: it.product_name,
        unit: it.unit,
        image_url: it.image_url,
        ordered_qty: it.ordered_qty,
        received_qty: it.received_qty,
        unit_cost: it.unit_cost,
        discount: it.discount,
        note: it.note
      }))
    );
    setFlash(null);
    setEditMode(true);
  }

  function cancelEditItems() {
    setEditMode(false);
    setDraftItems([]);
    setProductQuery("");
    setProductResults([]);
  }

  function updateDraftItem(key: string, patch: Partial<DraftItem>) {
    setDraftItems((prev) => prev.map((it) => (it.rowKey === key ? { ...it, ...patch } : it)));
  }

  function removeDraftItem(key: string) {
    setDraftItems((prev) => prev.filter((it) => it.rowKey !== key));
  }

  function addProductToDraft(hit: ProductHit) {
    setDraftItems((prev) => [
      ...prev,
      {
        rowKey: `tmp-${Math.random().toString(36).slice(2, 9)}`,
        product_id: hit.id,
        sku: hit.sku,
        product_name: hit.name,
        unit: hit.units || "",
        image_url: hit.image_url,
        ordered_qty: 1,
        received_qty: 0,
        unit_cost: hit.default_cost ?? 0,
        discount: 0,
        note: ""
      }
    ]);
    setProductQuery("");
    setProductResults([]);
  }

  async function saveItems() {
    if (!order) return;
    const validItems = draftItems.filter((it) => it.product_name || it.sku);
    if (validItems.length === 0) {
      setFlash({ kind: "error", message: "Đơn đặt hàng phải có ít nhất một sản phẩm." });
      return;
    }
    setSavingItems(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/purchase-orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: validItems.map((it) => ({
            product_id: it.product_id,
            sku: it.sku,
            product_name: it.product_name,
            unit: it.unit,
            image_url: it.image_url,
            ordered_qty: it.ordered_qty,
            received_qty: it.received_qty,
            unit_cost: it.unit_cost,
            discount: it.discount,
            note: it.note
          }))
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Không lưu được thay đổi.");
      setFlash({ kind: "ok", message: "Đã cập nhật danh sách sản phẩm." });
      setEditMode(false);
      setDraftItems([]);
      fetchOrder();
    } catch (e) {
      setFlash({ kind: "error", message: e instanceof Error ? e.message : "Lỗi không xác định." });
    } finally {
      setSavingItems(false);
    }
  }

  const handleCreateGoodsReceipt = async () => {
    if (!order || creatingGR) return;
    setCreatingGR(true);
    setFlash(null);
    try {
      const res = await fetch("/api/goods-receipts/from-purchase-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseOrderId: order.id,
          staff: order.staff,
          branch: order.branch
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        const errMsg = body?.error ?? body?.message ?? "Không tạo được đơn nhập hàng.";
        // Nếu API từ chối vì "đã có đơn nhập hàng" (do GR được tạo tự động
        // bởi confirmScanReceiptWithOptions ngay khi scan) → tự refetch PO để
        // lấy linked_goods_receipts rồi redirect thẳng tới GR đó thay vì báo lỗi.
        if (/đã có đơn nhập hàng/i.test(errMsg)) {
          // GR đã được tạo tự động bởi confirmScanReceiptWithOptions ngay khi
          // scan. Refetch PO để lấy linked_goods_receipts mới nhất rồi redirect.
          const fresh = await fetchOrder();
          const pending = (fresh?.linked_goods_receipts ?? order.linked_goods_receipts ?? []).find(
            (g) => g.receipt_status !== "cancelled"
          );
          if (pending) {
            router.push(`/products/goods-receipts/${pending.id}`);
            return;
          }
        }
        throw new Error(errMsg);
      }
      router.push(`/products/goods-receipts/${body.goodsReceiptId}`);
    } catch (e) {
      setFlash({ kind: "error", message: e instanceof Error ? e.message : "Lỗi không xác định." });
      setCreatingGR(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải đơn đặt hàng…
      </div>
    );
  }
  if (error || !order) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error || "Không tìm thấy đơn đặt hàng."}
        <div className="mt-3">
          <Link href="/products/purchase-orders" className="text-blue-600 hover:underline">
            ← Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }

  const statusMeta = STATUS_META[order.status] ?? STATUS_META.pending;

  return (
    <PageGuard permission="purchase_orders.view">
    <div className="flex flex-col gap-4 px-4 pb-8 lg:px-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/products/purchase-orders"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" /> Danh sách đơn đặt hàng
        </Link>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
            {order.code}
          </span>
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
          <Field label="Mã đơn nhập" value={order.code} />
          <Field label="Ngày tạo" value={formatDateOnly(order.created_at)} />
          <Field
            label="Trạng thái"
            value={
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
            }
          />
          <Field label="Nhà cung cấp" value={order.supplier_name || "—"} />
          <Field label="Địa chỉ" value="—" />
          <Field label="Công nợ" value={formatCurrencyVND(order.total)} />
          <Field label="Tổng đơn nhập" value={formatCurrencyVND(totalCost)} highlight />
          <Field label="Trả hàng" value={formatCurrencyVND(0)} />
          <Field label="Chi nhánh" value={order.branch || "—"} />
          <Field label="Chính sách nhập" value="Theo đơn đặt hàng" />
          <Field label="Chính sách giá" value="—" />
          <Field label="Nhân viên phụ trách" value={order.staff || "—"} />
          <Field label="Ngày hẹn giao" value={formatDateOnly(order.expected_date)} />
          <Field label="Ngày nhập" value="—" />
          <Field label="Ngày hoàn đơn" value="—" />
          <Field label="Tham chiếu" value={order.supplier_phone || "—"} />
        </div>

        {order.invoice_document_id ? (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <span>📎 Đơn đặt hàng nhập này sinh ra từ hóa đơn scan.</span>
            <Link
              href={`/summary?documentId=${encodeURIComponent(order.invoice_document_id)}`}
              className="ml-auto inline-flex items-center gap-1 font-semibold hover:underline"
            >
              Xem hóa đơn gốc <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          {(
            [
              ["info", "Tạo đơn"],
              ["receiving", "Nhập hàng"],
              ["completed", "Hoàn thành"]
            ] as [TabKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-sm transition-colors ${
                tab === key
                  ? "border-b-2 border-blue-600 text-blue-600 font-semibold"
                  : "text-slate-500 hover:text-blue-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Items table */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
          <h3 className="text-sm font-semibold text-slate-800">Danh sách sản phẩm</h3>
          {!editMode ? (
            <button
              type="button"
              onClick={enterEditMode}
              disabled={itemsLocked}
              title={itemsLocked ? "Đơn đã có phiếu nhập hàng liên kết — không thể sửa sản phẩm." : undefined}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <Pencil className="h-3.5 w-3.5" /> Sửa sản phẩm
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={cancelEditItems}
                disabled={savingItems}
                className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={saveItems}
                disabled={savingItems}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingItems ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Lưu thay đổi
              </button>
            </div>
          )}
        </div>

        {editMode ? (
          <div className="border-b border-slate-100 p-3">
            <div className="relative" ref={productBoxRef}>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Tìm sản phẩm để thêm vào đơn (tên, SKU)..."
                className="w-full rounded border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              {productResults.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
                  {productResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProductToDraft(p)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-800">{p.name}</div>
                        <div className="text-xs text-slate-500">
                          SKU: {p.sku || "—"} · {formatCurrencyVND(p.default_cost)}
                        </div>
                      </div>
                      <Plus className="h-4 w-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              ) : productLoading ? (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 flex items-center gap-2 rounded border border-slate-200 bg-white p-3 text-sm text-slate-500 shadow-lg">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tìm…
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {(editMode ? draftItems.length === 0 : order.items.length === 0) ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Đơn đặt hàng chưa có sản phẩm.
          </div>
        ) : editMode ? (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">STT</th>
                  <th className="px-3 py-2.5">Ảnh</th>
                  <th className="px-3 py-2.5">Tên sản phẩm</th>
                  <th className="px-3 py-2.5">Đơn vị</th>
                  <th className="px-3 py-2.5 text-right">SL đặt</th>
                  <th className="px-3 py-2.5 text-right">Đơn giá</th>
                  <th className="px-3 py-2.5 text-right">Chiết khấu</th>
                  <th className="px-3 py-2.5 text-right">Thành tiền</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draftItems.map((it, idx) => {
                  const lineTotal = Math.max(it.ordered_qty * it.unit_cost - it.discount, 0);
                  return (
                    <tr key={it.rowKey} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-2">
                        {it.image_url ? (
                          <img src={it.image_url} alt="" className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-slate-300">
                            <Package className="h-4 w-4" />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{it.product_name}</div>
                        <div className="text-xs text-slate-500">{it.sku ? `SKU: ${it.sku}` : "—"}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{it.unit || "—"}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={it.ordered_qty || ""}
                          onChange={(e) => updateDraftItem(it.rowKey, { ordered_qty: parseNum(e.target.value) })}
                          onFocus={(e) => e.target.select()}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={it.unit_cost || ""}
                          onChange={(e) => updateDraftItem(it.rowKey, { unit_cost: parseNum(e.target.value) })}
                          onFocus={(e) => e.target.select()}
                          className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={it.discount || ""}
                          onChange={(e) => updateDraftItem(it.rowKey, { discount: parseNum(e.target.value) })}
                          onFocus={(e) => e.target.select()}
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatCurrencyVND(lineTotal)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeDraftItem(it.rowKey)}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((it, idx) => (
                  <tr key={it.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2">
                      {it.image_url ? (
                        <img
                          src={it.image_url}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
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
                      {formatCurrencyVND(Number(it.unit_cost))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrencyVND(Number(it.discount) || 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCurrencyVND(Number(it.line_total))}
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
                    {formatCurrencyVND(totalCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Linked goods receipts */}
      {linkedGR.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">Đơn nhập hàng liên kết</div>
          <ul className="space-y-1.5 text-sm">
            {linkedGR.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <ChevronRight className="h-3 w-3 text-slate-400" />
                <Link href={`/products/goods-receipts/${g.id}`} className="font-mono text-blue-600 hover:underline">
                  {g.code}
                </Link>
                <span className="text-slate-500">({g.receipt_status})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Action bar */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Trash2 className="h-4 w-4" /> Hủy
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Copy className="h-4 w-4" /> Sao đơn
        </button>
        <button
          type="button"
          onClick={() => {
            // Nếu đã có GR pending → điều hướng thẳng tới GR (tránh gọi API
            // createGoodsReceiptFromPurchaseOrder fail vì "đã có GR liên kết").
            // GR pending được tạo tự động bởi confirmScanReceiptWithOptions ngay
            // khi user bấm Xác nhận từ modal scan.
            if (hasActiveGR) {
              const pending = linkedGR.find(
                (g) => g.receipt_status === "pending" || g.receipt_status === "in_progress"
              );
              if (pending) {
                router.push(`/products/goods-receipts/${pending.id}`);
              }
              return;
            }
            handleCreateGoodsReceipt();
          }}
          disabled={creatingGR || order.status === "cancelled"}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            order.status === "cancelled"
              ? "Đơn đã hủy"
              : hasActiveGR
                ? "Mở đơn nhập hàng đang xử lý"
                : ""
          }
        >
          {creatingGR ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
          {hasActiveGR ? "Mở đơn nhập hàng" : "Nhập hàng"}
        </button>
      </div>
    </div>
    </PageGuard>
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
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`text-sm ${highlight ? "font-semibold text-blue-700" : "text-slate-900"}`}>
        {value}
        {suffix ? <span className="ml-0.5 text-xs text-slate-500">{suffix}</span> : null}
      </div>
    </div>
  );
}
