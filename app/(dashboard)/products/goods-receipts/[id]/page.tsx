"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Wallet,
  Banknote,
  CreditCard,
  Pencil,
  Search,
  Plus,
  X,
  Package,
  Trash2,
  AlertTriangle
} from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";
import { PageGuard } from "@/components/auth/PageGuard";

type ReceiptStatus = "pending" | "in_progress" | "completed" | "cancelled";
type PaymentStatus = "unpaid" | "partial" | "paid";
type PaymentMethod = "cash" | "bank_transfer" | "card";

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
  payment_status: PaymentStatus;
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
  completed: { label: "Đã nhập hàng", className: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Đã hủy", className: "bg-red-100 text-red-700" }
};

// Trạng thái thanh toán cho NCC — TÁCH RIÊNG khỏi STATUS_META (trạng thái
// nhập hàng/tồn kho ở trên). Xem lib/inventory/receipts.ts updateGoodsReceiptPayment.
const PAYMENT_META: Record<PaymentStatus, { label: string; className: string }> = {
  unpaid: { label: "Chưa thanh toán", className: "bg-slate-100 text-slate-600" },
  partial: { label: "Thanh toán 1 phần", className: "bg-amber-100 text-amber-700" },
  paid: { label: "Đã thanh toán", className: "bg-emerald-100 text-emerald-700" }
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  card: "Quẹt thẻ"
};

interface ProductHit {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  default_cost: number;
}

// Bản nháp đang sửa — dùng CHUNG shape với goods-receipts/new/page.tsx để dễ
// đối chiếu, nhưng thêm rowKey riêng (id thật của item cũ, hoặc tmp-xxx cho
// item mới thêm) vì backend delete+reinsert toàn bộ items khi lưu (xem
// updateGoodsReceipt ở lib/goods-receipts/repository.ts) nên không cần giữ id.
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

  // ── Sửa sản phẩm trong đơn (thêm/sửa/xoá) — đôi khi nhập nhầm cần chỉnh tay.
  // Cho phép ở MỌI trạng thái; nếu đơn đã "completed" (đã cộng tồn kho),
  // updateGoodsReceipt ở backend tự hoàn tồn cũ + cộng lại theo item mới.
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
      fetch(`/api/goods-receipts/products-search?q=${encodeURIComponent(productQuery)}`)
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
    if (!gr) return;
    setDraftItems(
      gr.items.map((it) => ({
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
        product_id: hit.product_id,
        sku: hit.sku,
        product_name: hit.product_name,
        unit: hit.unit || "",
        image_url: hit.image_url,
        ordered_qty: 0,
        received_qty: 1,
        unit_cost: hit.default_cost ?? 0,
        discount: 0,
        note: ""
      }
    ]);
    setProductQuery("");
    setProductResults([]);
  }

  async function saveItems() {
    if (!gr) return;
    const validItems = draftItems.filter((it) => it.product_name || it.sku);
    if (validItems.length === 0) {
      setFlash({ kind: "error", message: "Đơn nhập hàng phải có ít nhất một sản phẩm." });
      return;
    }
    setSavingItems(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/goods-receipts/${encodeURIComponent(gr.id)}`, {
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
      fetchData();
    } catch (e) {
      setFlash({ kind: "error", message: e instanceof Error ? e.message : "Lỗi không xác định." });
    } finally {
      setSavingItems(false);
    }
  }

  // ── Xoá sản phẩm khỏi đơn (tick chọn + xác nhận) — KHÔNG viết API riêng,
  // tái dùng đúng PATCH /api/goods-receipts/[id] (full-replace items) mà
  // "Sửa sản phẩm" đang dùng: gửi lại danh sách item CÒN LẠI (đã bỏ các item
  // bị tick). updateGoodsReceipt tự hoàn tồn cho item cũ + cộng lại theo item
  // mới nên xoá 1 sản phẩm đã "Đã cộng" tồn kho cũng tự động hoàn tồn đúng.
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingItems, setDeletingItems] = useState(false);

  function enterDeleteMode() {
    setSelectedForDelete(new Set());
    setFlash(null);
    setDeleteMode(true);
  }

  function cancelDeleteMode() {
    setDeleteMode(false);
    setSelectedForDelete(new Set());
  }

  function toggleSelectForDelete(itemId: string) {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function requestDeleteSelected() {
    if (!gr || selectedForDelete.size === 0) return;
    if (selectedForDelete.size >= gr.items.length) {
      setFlash({ kind: "error", message: "Đơn nhập hàng phải có ít nhất một sản phẩm — hãy bỏ chọn bớt." });
      return;
    }
    setConfirmDeleteOpen(true);
  }

  async function confirmDeleteSelected() {
    if (!gr) return;
    setDeletingItems(true);
    setFlash(null);
    try {
      const remaining = gr.items.filter((it) => !selectedForDelete.has(it.id));
      const res = await fetch(`/api/goods-receipts/${encodeURIComponent(gr.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: remaining.map((it) => ({
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
      if (!res.ok) throw new Error(body?.error ?? "Không xoá được sản phẩm.");
      setFlash({ kind: "ok", message: `Đã xoá ${selectedForDelete.size} sản phẩm khỏi đơn nhập hàng.` });
      setConfirmDeleteOpen(false);
      setDeleteMode(false);
      setSelectedForDelete(new Set());
      fetchData();
    } catch (e) {
      setFlash({ kind: "error", message: e instanceof Error ? e.message : "Lỗi không xác định." });
    } finally {
      setDeletingItems(false);
    }
  }

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
            ? "Đã xác nhận nhập hàng. Đã cộng tồn kho."
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

  // ── Thanh toán cho NCC — TÁCH BIỆT hoàn toàn khỏi trạng thái nhập hàng/tồn
  // kho ở trên. Xem app/api/goods-receipts/[id]/payment/route.ts.
  const [showPayForm, setShowPayForm] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");

  const openPayForm = () => {
    if (!gr) return;
    setPayAmount(Math.max(0, gr.total_cost - gr.paid));
    setPayMethod((gr.payment_method as PaymentMethod) || "cash");
    setShowPayForm(true);
  };

  const submitPayment = async () => {
    if (!gr || busy) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/goods-receipts/${encodeURIComponent(gr.id)}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: payAmount, paymentMethod: payMethod })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body?.error ?? body?.message ?? "Không cập nhật được thanh toán.");
      }
      setFlash({ kind: "ok", message: body.message ?? "Đã cập nhật thanh toán." });
      setShowPayForm(false);
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
  const paymentStatusMeta = PAYMENT_META[gr.payment_status] ?? PAYMENT_META.unpaid;
  const stockAddedCount = gr.items.filter((it) => it.stock_added_at).length;
  const allStockAdded = gr.items.length > 0 && stockAddedCount === gr.items.length;

  return (
    <PageGuard permission="goods_receipts.view">
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
            label="Trạng thái thanh toán"
            value={
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${paymentStatusMeta.className}`}>
                {paymentStatusMeta.label}
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
          <Field label="Công nợ" value={formatCurrencyVND(gr.total_cost)} highlight />
          <Field label="Tổng đơn nhập" value={formatCurrencyVND(totalCost)} highlight />
          <Field label="Trả hàng" value={formatCurrencyVND(0)} />
          <Field
            label="Đã thanh toán"
            value={`${formatCurrencyVND(gr.paid)}${gr.paid > 0 ? ` (${PAYMENT_METHOD_LABELS[(gr.payment_method as PaymentMethod) || "cash"] ?? gr.payment_method})` : ""}`}
          />
          <Field
            label="Còn lại"
            value={formatCurrencyVND(Math.max(0, gr.total_cost - gr.paid))}
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
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
          <h3 className="text-sm font-semibold text-slate-800">Danh sách sản phẩm</h3>
          {!editMode && !deleteMode ? (
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={enterEditMode}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Pencil className="h-3.5 w-3.5" /> Sửa sản phẩm
              </button>
              <button
                type="button"
                onClick={enterDeleteMode}
                disabled={gr.items.length === 0}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Xoá sản phẩm
              </button>
            </div>
          ) : editMode ? (
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
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">Đã chọn {selectedForDelete.size} sản phẩm</span>
              <button
                type="button"
                onClick={cancelDeleteMode}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={requestDeleteSelected}
                disabled={selectedForDelete.size === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xoá ({selectedForDelete.size})
              </button>
            </div>
          )}
        </div>

        {editMode ? (
          <div className="border-b border-slate-100 p-3">
            {gr.receipt_status === "completed" ? (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Đơn đã cộng tồn kho — lưu thay đổi sẽ tự hoàn tồn cũ và cộng lại theo số liệu mới.
              </div>
            ) : null}
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
                      key={p.product_id}
                      type="button"
                      onClick={() => addProductToDraft(p)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-800">{p.product_name}</div>
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

        {(editMode ? draftItems.length === 0 : gr.items.length === 0) ? (
          <div className="p-12 text-center text-sm text-slate-500">Đơn chưa có sản phẩm.</div>
        ) : editMode ? (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">STT</th>
                  <th className="px-3 py-2.5">Ảnh</th>
                  <th className="px-3 py-2.5">Tên sản phẩm</th>
                  <th className="px-3 py-2.5">Đơn vị</th>
                  <th className="px-3 py-2.5 text-right">SL nhập</th>
                  <th className="px-3 py-2.5 text-right">Đơn giá</th>
                  <th className="px-3 py-2.5 text-right">Chiết khấu</th>
                  <th className="px-3 py-2.5 text-right">Thành tiền</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draftItems.map((it, idx) => {
                  const lineTotal = Math.max(it.received_qty * it.unit_cost - it.discount, 0);
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
                          value={it.received_qty || ""}
                          onChange={(e) => updateDraftItem(it.rowKey, { received_qty: parseNum(e.target.value) })}
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
                  {deleteMode ? <th className="w-10 px-3 py-2.5"></th> : null}
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
                  <tr
                    key={it.id}
                    onClick={deleteMode ? () => toggleSelectForDelete(it.id) : undefined}
                    className={`hover:bg-slate-50/50 ${deleteMode ? "cursor-pointer" : ""} ${
                      deleteMode && selectedForDelete.has(it.id) ? "bg-red-50/70" : ""
                    }`}
                  >
                    {deleteMode ? (
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedForDelete.has(it.id)}
                          onChange={() => toggleSelectForDelete(it.id)}
                          className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                        />
                      </td>
                    ) : null}
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
                      {formatCurrencyVND(Number(it.unit_cost))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrencyVND(Number(it.discount) || 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCurrencyVND(Number(it.line_total))}
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
                  <td colSpan={deleteMode ? 6 : 5} className="px-3 py-2 text-right font-semibold text-slate-700">
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
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Thanh toán cho NCC — form chọn phương thức, tách biệt hoàn toàn khỏi
          trạng thái nhập hàng/tồn kho ở action bar bên dưới. */}
      {showPayForm ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Thanh toán cho nhà cung cấp</h3>
            <button
              type="button"
              onClick={() => setShowPayForm(false)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Đóng
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Số tiền thanh toán</label>
              <input
                type="number"
                min={0}
                step={1000}
                value={payAmount || ""}
                onChange={(e) => setPayAmount(Math.max(0, Number(e.target.value) || 0))}
                className="w-44 rounded border border-slate-300 px-3 py-1.5 text-right text-sm"
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Còn phải trả: {formatCurrencyVND(Math.max(0, gr.total_cost - gr.paid))}
              </div>
            </div>
            <div className="flex gap-2">
              {(["cash", "bank_transfer", "card"] as PaymentMethod[]).map((m) => (
                <PayMethodButton
                  key={m}
                  active={payMethod === m}
                  onClick={() => setPayMethod(m)}
                  icon={
                    m === "cash" ? (
                      <Banknote className="h-4 w-4" />
                    ) : m === "bank_transfer" ? (
                      <Wallet className="h-4 w-4" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )
                  }
                >
                  {PAYMENT_METHOD_LABELS[m]}
                </PayMethodButton>
              ))}
            </div>
            <button
              type="button"
              onClick={submitPayment}
              disabled={busy || payAmount <= 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Xác nhận thanh toán
            </button>
          </div>
        </div>
      ) : null}

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

        <div className="ml-auto flex items-center gap-2">
          {gr.payment_status !== "paid" ? (
            <button
              type="button"
              onClick={openPayForm}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              <Wallet className="h-4 w-4" /> Thanh toán
            </button>
          ) : null}

          {gr.receipt_status !== "completed" ? (
            <button
              type="button"
              onClick={() => transitionStatus("completed")}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Xác nhận đã nhập hàng
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
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Hoàn lại "Chờ nhận hàng"
            </button>
          )}
        </div>
      </div>

      {/* Xác nhận xoá sản phẩm — popup riêng, KHÔNG dùng window.confirm */}
      {confirmDeleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start gap-3 px-6 py-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Xác nhận xoá sản phẩm</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Bạn có chắc chắn muốn xoá{" "}
                  <span className="font-semibold text-slate-800">{selectedForDelete.size} sản phẩm</span> đã
                  chọn khỏi đơn nhập hàng này không?
                  {gr.items.some((it) => selectedForDelete.has(it.id) && it.stock_added_at) ? (
                    <span className="mt-1.5 block text-amber-700">
                      Lưu ý: tồn kho đã cộng của các sản phẩm này sẽ được hoàn lại tương ứng.
                    </span>
                  ) : null}
                </p>
                <ul className="mt-2 max-h-28 list-disc space-y-0.5 overflow-y-auto pl-4 text-xs text-slate-500">
                  {gr.items
                    .filter((it) => selectedForDelete.has(it.id))
                    .map((it) => (
                      <li key={it.id}>{it.product_name}</li>
                    ))}
                </ul>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={deletingItems}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={confirmDeleteSelected}
                disabled={deletingItems}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deletingItems ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {deletingItems ? "Đang xoá..." : "Xoá"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </PageGuard>
  );
}

function PayMethodButton({
  active,
  onClick,
  icon,
  children
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
        active
          ? "border-blue-500 bg-blue-50 text-blue-700"
          : "border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600"
      }`}
    >
      {icon}
      {children}
    </button>
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
