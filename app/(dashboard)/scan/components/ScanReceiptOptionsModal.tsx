"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  PackagePlus,
  Plus,
  PlusCircle,
  Search,
  Sparkles,
  X
} from "lucide-react";
import { cleanInvoiceProductName } from "@/lib/shared/format";

interface MatchedProduct {
  id: string;
  sku: string;
  name: string;
  stock: number;
  unit: string;
}

interface RowHint {
  rowId: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  defaultAction: "add_stock" | "new";
  matchedProducts: MatchedProduct[];
  defaultProductId: string | null;
}

interface CheckResponse {
  documentId: string;
  fileName: string;
  status: string;
  supplierName: string;
  decisions: RowHint[];
  validCount: number;
  skippedCount: number;
}

interface ConfirmResponse {
  success: boolean;
  message: string;
  receipt: { code: string; id: string } | null;
  purchaseOrderId: string | null;
  purchaseOrderCode: string | null;
  createdProductIds: string[];
  error?: string;
}

interface SearchApiResponse {
  exact: MatchedProduct | null;
  results: MatchedProduct[];
}

type DecisionMap = Record<
  string,
  { action: "add_stock" | "new"; productId: string | null }
>;

const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function readJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

export default function ScanReceiptOptionsModal({
  documentId,
  onClose
}: {
  documentId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<CheckResponse | null>(null);
  const [decisions, setDecisions] = useState<DecisionMap>({});
  const [supplierName, setSupplierName] = useState("");
  // Editable invoice-side fields per row (rows the user can override from the
  // modal in case OCR misread name/SKU/unit/quantity/cost).
  const [editableName, setEditableName] = useState<Record<string, string>>({});
  const [editableSku, setEditableSku] = useState<Record<string, string>>({});
  const [editableUnit, setEditableUnit] = useState<Record<string, string>>({});
  const [editableQty, setEditableQty] = useState<Record<string, string>>({});
  const [editableCost, setEditableCost] = useState<Record<string, string>>({});

  // Fetch the scan document and default candidates per row.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(
      `/api/inventory/receipts/check-document?documentId=${encodeURIComponent(documentId)}`
    )
      .then((res) => res.json().then((body: any) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) throw new Error(body?.error ?? "Không tải được thông tin hóa đơn.");
        const d = body as CheckResponse;
        setData(d);
        setSupplierName(d.supplierName ?? "");

        // Initialize editable fields from server response.
        const nameMap: Record<string, string> = {};
        const skuMap: Record<string, string> = {};
        const unitMap: Record<string, string> = {};
        const qtyMap: Record<string, string> = {};
        const costMap: Record<string, string> = {};
        for (const r of d.decisions) {
          nameMap[r.rowId] = r.productName;
          skuMap[r.rowId] = r.sku;
          unitMap[r.rowId] = r.unit;
          qtyMap[r.rowId] = String(r.quantity ?? "");
          costMap[r.rowId] = String(r.unitCost ?? "");
        }
        setEditableName(nameMap);
        setEditableSku(skuMap);
        setEditableUnit(unitMap);
        setEditableQty(qtyMap);
        setEditableCost(costMap);

        // Auto-fill decisions based on server-side matches:
        //   - 1 match → add_stock with that product
        //   - ≥2 matches → add_stock, default to first (user picks later)
        //   - 0 matches → new (user can still search & override)
        const map: DecisionMap = {};
        for (const r of d.decisions) {
          if (r.quantity <= 0 || !r.productName) continue;
          if (r.matchedProducts.length > 0) {
            map[r.rowId] = {
              action: "add_stock",
              productId: r.defaultProductId ?? r.matchedProducts[0].id ?? null
            };
          } else {
            map[r.rowId] = { action: "new", productId: null };
          }
        }
        setDecisions(map);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi mạng."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const validRows = useMemo(
    () =>
      data?.decisions.filter((r) => {
        const q = Number(editableQty[r.rowId]);
        const n = (editableName[r.rowId] ?? "").trim();
        return Number.isFinite(q) && q > 0 && n.length > 0;
      }) ?? [],
    [data, editableName, editableQty]
  );

  const skippedRows = useMemo(
    () =>
      data?.decisions.filter((r) => {
        const q = Number(editableQty[r.rowId]);
        const n = (editableName[r.rowId] ?? "").trim();
        return !(Number.isFinite(q) && q > 0 && n.length > 0);
      }) ?? [],
    [data, editableName, editableQty]
  );

  const stats = useMemo(() => {
    const entries = Object.values(decisions);
    return {
      addStock: entries.filter((d) => d.action === "add_stock").length,
      newProduct: entries.filter((d) => d.action === "new").length
    };
  }, [decisions]);

  const totalAmount = useMemo(() => {
    if (!data) return 0;
    let sum = 0;
    for (const r of data.decisions) {
      const q = Number(editableQty[r.rowId]);
      const c = Number(editableCost[r.rowId]);
      const n = (editableName[r.rowId] ?? "").trim();
      if (!(Number.isFinite(q) && q > 0 && n.length > 0)) continue;
      sum += q * (Number.isFinite(c) ? c : 0);
    }
    return sum;
  }, [data, editableName, editableQty, editableCost]);

  const isDocumentValid =
    !!data &&
    data.status !== "error" &&
    data.status !== "processing" &&
    data.status !== "uploading";

  const canSubmit =
    !loading && !submitting && validRows.length > 0 && isDocumentValid;

  // Switch the action back to "new" if user clears the product picker.
  const setRowAction = (rowId: string, action: "add_stock" | "new") => {
    setDecisions((current) => {
      const prev = current[rowId];
      if (action === "add_stock") {
        const row = data?.decisions.find((r) => r.rowId === rowId);
        const fallbackId =
          row?.defaultProductId ?? row?.matchedProducts[0]?.id ?? null;
        return { ...current, [rowId]: { action, productId: prev?.productId ?? fallbackId } };
      }
      return { ...current, [rowId]: { action, productId: null } };
    });
  };

  const setRowProduct = (rowId: string, productId: string | null) => {
    setDecisions((current) => {
      const next: DecisionMap = { ...current };
      if (productId === null) {
        next[rowId] = { action: "new", productId: null };
      } else {
        next[rowId] = { action: "add_stock", productId };
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!data || !canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      // Always submit with the (possibly overridden) editable values so any
      // manual correction flows through. The server-side `confirmScanReceiptWithOptions`
      // re-derives everything from invoice_rows, so to honor in-modal edits we
      // update the underlying rows first via /api/inventory/receipts/invoice-rows.
      const decisionsPayload = validRows.map((r) => ({
        rowId: r.rowId,
        action: decisions[r.rowId]?.action ?? r.defaultAction,
        productId: decisions[r.rowId]?.productId ?? r.defaultProductId ?? null
      }));

      // 1) Push row-level edits (name/SKU/unit/qty/cost) into the DB if any.
      const editsPayload = validRows
        .map((r) => ({
          rowId: r.rowId,
          productName: (editableName[r.rowId] ?? "").trim(),
          sku: (editableSku[r.rowId] ?? "").trim(),
          unit: (editableUnit[r.rowId] ?? "").trim(),
          quantity: editableQty[r.rowId] ?? "",
          unitCost: editableCost[r.rowId] ?? ""
        }))
        .filter((e) => {
          const orig = data.decisions.find((r) => r.rowId === e.rowId);
          if (!orig) return false;
          return (
            e.productName !== orig.productName ||
            e.sku !== orig.sku ||
            e.unit !== orig.unit ||
            String(orig.quantity) !== e.quantity ||
            String(orig.unitCost) !== e.unitCost
          );
        });

      if (editsPayload.length > 0) {
        const editRes = await fetch(
          "/api/inventory/receipts/invoice-rows",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentId: data.documentId, rows: editsPayload })
          }
        );
        const editBody = await editRes.json().catch(() => ({}));
        if (!editRes.ok || (editBody as any).success === false) {
          throw new Error((editBody as any).error ?? "Không lưu được sửa đổi.");
        }
      }

      const res = await fetch(
        "/api/inventory/receipts/confirm-with-options",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: data.documentId,
            rowIds: decisionsPayload.map((d) => d.rowId),
            decisions: decisionsPayload,
            supplier_name: supplierName.trim() || undefined
          })
        }
      );
      const body = (await readJson<ConfirmResponse>(res)) as ConfirmResponse & {
        error?: string;
      };
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? body.message ?? "Không tạo được phiếu nhập.");
      }
      if (body.purchaseOrderId) {
        router.push(`/products/purchase-orders/${body.purchaseOrderId}`);
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <PackagePlus className="h-5 w-5 text-primary" />
              Tạo đơn đặt hàng nhập từ scan
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {data ? (
                <>
                  {data.fileName} · {validRows.length} dòng hợp lệ
                  {skippedRows.length > 0 ? ` · ${skippedRows.length} dòng bị bỏ qua` : ""}
                  {" · Bấm vào cột "}
                  <strong>Khớp với sản phẩm</strong>
                  {" để chọn: đã có trong danh sách (tìm theo SKU/tên) hoặc tạo mới. Bấm "}
                  <strong>Tạo đơn đặt hàng nhập</strong>
                  {" để tạo PO + đơn nhập hàng ở trạng thái chờ — vào PO rồi bấm "}
                  <strong>"Mở đơn nhập hàng"</strong>
                  {" → "}
                  <strong>"Hoàn thành"</strong>
                  {" để cộng tồn kho."}
                </>
              ) : (
                "Đang tải thông tin hóa đơn…"
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Đang tải thông tin hóa đơn…
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : !data ? (
            <div className="py-16 text-center text-sm text-slate-500">Không có dữ liệu.</div>
          ) : (
            <>
              {/* Document error/loading warnings */}
              {data.status === "error" ? (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <span>⚠️</span>
                  <span>
                    Hóa đơn đang ở trạng thái lỗi OCR. Vui lòng scan lại hoặc sửa thủ công trước khi
                    xác nhận.
                  </span>
                </div>
              ) : data.status === "processing" || data.status === "uploading" ? (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Hóa đơn đang được xử lý. Vui lòng đợi.</span>
                </div>
              ) : null}

              {/* Supplier row */}
              <div className="mb-4 grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center">
                <label className="text-sm font-semibold text-slate-700">Nhà cung cấp</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Tên nhà cung cấp (sẽ tự tạo nếu chưa có)"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Decisions table */}
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5">Sản phẩm / SKU</th>
                      <th className="px-3 py-2.5 text-right">SL</th>
                      <th className="px-3 py-2.5 text-right">Đơn giá</th>
                      <th className="px-3 py-2.5 text-right">Thành tiền</th>
                      <th className="px-3 py-2.5">Khớp với sản phẩm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {validRows.map((row) => (
                      <DecisionsRow
                        key={row.rowId}
                        row={row}
                        decisions={decisions}
                        editableName={editableName}
                        editableSku={editableSku}
                        editableUnit={editableUnit}
                        editableQty={editableQty}
                        editableCost={editableCost}
                        onNameChange={(v) => setEditableName((m) => ({ ...m, [row.rowId]: cleanInvoiceProductName(v) }))}
                        onSkuChange={(v) => setEditableSku((m) => ({ ...m, [row.rowId]: v }))}
                        onUnitChange={(v) => setEditableUnit((m) => ({ ...m, [row.rowId]: v }))}
                        onQtyChange={(v) => setEditableQty((m) => ({ ...m, [row.rowId]: v }))}
                        onCostChange={(v) => setEditableCost((m) => ({ ...m, [row.rowId]: v }))}
                        onActionChange={(action) => setRowAction(row.rowId, action)}
                        onProductChange={(productId) => setRowProduct(row.rowId, productId)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {skippedRows.length > 0 ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    {skippedRows.length} dòng sẽ bị bỏ qua (thiếu tên/số lượng)
                  </div>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-amber-700">
                    {skippedRows.map((r) => (
                      <li key={r.rowId}>
                        {editableName[r.rowId] || "(không có tên)"} · SKU{" "}
                        {editableSku[r.rowId] || "—"} · SL {editableQty[r.rowId] || "0"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700">
              <PlusCircle className="h-3.5 w-3.5" />
              {stats.addStock} cộng tồn
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 font-medium text-blue-700">
              <PackagePlus className="h-3.5 w-3.5" />
              {stats.newProduct} tạo mới
            </span>
            {data ? (
              <span className="font-medium text-slate-700">
                Tổng: {fmtMoney.format(totalAmount)} đ
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang xử lý…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Tạo đơn đặt hàng nhập
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Per-row component: handles the editable invoice fields, action radios, and
// the product picker (auto-fill + searchable dropdown).
// ----------------------------------------------------------------------------

interface DecisionsRowProps {
  row: RowHint;
  decisions: DecisionMap;
  editableName: Record<string, string>;
  editableSku: Record<string, string>;
  editableUnit: Record<string, string>;
  editableQty: Record<string, string>;
  editableCost: Record<string, string>;
  onNameChange: (v: string) => void;
  onSkuChange: (v: string) => void;
  onUnitChange: (v: string) => void;
  onQtyChange: (v: string) => void;
  onCostChange: (v: string) => void;
  onActionChange: (action: "add_stock" | "new") => void;
  onProductChange: (productId: string | null) => void;
}

function DecisionsRow({
  row,
  decisions,
  editableName,
  editableSku,
  editableUnit,
  editableQty,
  editableCost,
  onNameChange,
  onSkuChange,
  onUnitChange,
  onQtyChange,
  onCostChange,
  onActionChange,
  onProductChange
}: DecisionsRowProps) {
  const decision = decisions[row.rowId];
  const isAddStock = decision?.action === "add_stock";
  const matched = row.matchedProducts;
  const qty = Number(editableQty[row.rowId] ?? "");
  const cost = Number(editableCost[row.rowId] ?? "");
  const lineTotal = Number.isFinite(qty) && Number.isFinite(cost) ? qty * cost : 0;

  // Auto-fill SKU placeholder khi user chọn "Sẽ tạo mới" mà SKU đang rỗng.
  // Giúp user biết SKU sẽ được tự generate (không bắt buộc nhập tay).
  const skuPreview = useMemo(() => {
    if (isAddStock) return "";
    if ((editableSku[row.rowId] ?? "").trim()) return "";
    const ts = Date.now().toString(36).slice(-6).toUpperCase();
    return `SKU-${ts}-XX`;
  }, [isAddStock, editableSku, row.rowId]);

  return (
    <tr className="hover:bg-slate-50/50">
      <td className="px-3 py-2.5 align-top">
        <input
          type="text"
          value={editableName[row.rowId] ?? ""}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm font-medium text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Tên sản phẩm trên hóa đơn"
        />
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <span>SKU:</span>
          <input
            type="text"
            value={editableSku[row.rowId] ?? ""}
            onChange={(e) => onSkuChange(e.target.value)}
            className="w-32 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={
              skuPreview ||
              (isAddStock ? "(đã có - SKU lấy từ SP)" : "(tự sinh khi nhập)")
            }
            title={
              skuPreview
                ? `Bỏ trống sẽ được tự động tạo mã SKU khi nhập kho (ví dụ: ${skuPreview})`
                : undefined
            }
          />
          <input
            type="text"
            value={editableUnit[row.rowId] ?? ""}
            onChange={(e) => onUnitChange(e.target.value)}
            className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="ĐVT"
          />
        </div>
      </td>
      <td className="px-3 py-2.5 text-right align-top">
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={editableQty[row.rowId] ?? ""}
          onChange={(e) => onQtyChange(e.target.value)}
          className="w-24 rounded-md border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </td>
      <td className="px-3 py-2.5 text-right align-top">
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={editableCost[row.rowId] ?? ""}
          onChange={(e) => onCostChange(e.target.value)}
          className="w-28 rounded-md border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </td>
      <td className="px-3 py-2.5 text-right align-top font-medium tabular-nums">
        {fmtMoney.format(lineTotal)}
      </td>
      <td className="relative px-3 py-2.5 align-top">
        <SkuActionCell
          rowId={row.rowId}
          sku={editableSku[row.rowId] ?? ""}
          name={editableName[row.rowId] ?? ""}
          preferred={matched}
          decision={decision}
          onActionChange={(action) => onActionChange(action)}
          onProductChange={(pid) => onProductChange(pid)}
        />
      </td>
    </tr>
  );
}

// ----------------------------------------------------------------------------
// SkuActionCell — thay thế radio Cộng tồn / Tạo mới bằng 1 badge clickable
// trên ô SKU. Click vào badge mở menu 2 lựa chọn:
//
//   1. "✓ Đã có sản phẩm này trong danh sách sản phẩm"
//      → Mở search dropdown (giống ProductPicker cũ) để user tìm theo SKU
//        hoặc tên sản phẩm rồi chọn. Có thể gõ để live-search.
//   2. "+ Sản phẩm này chưa có trong danh sách sản phẩm"
//      → Set action = "new", sẽ tạo mới SP khi confirm.
//
// UX:
//   - add_stock + có productId → badge xanh, hiển thị tên SP đã chọn + SKU
//   - add_stock + chưa có productId → badge vàng, "Mở dropdown chọn SP"
//   - new → badge xám, "Sẽ tạo mới khi nhập"
// ----------------------------------------------------------------------------

interface SkuActionCellProps {
  rowId: string;
  sku: string;
  name: string;
  preferred: MatchedProduct[];
  decision: { action: "add_stock" | "new"; productId: string | null } | undefined;
  onActionChange: (action: "add_stock" | "new") => void;
  onProductChange: (productId: string | null) => void;
}

function SkuActionCell({
  rowId,
  sku,
  name,
  preferred,
  decision,
  onActionChange,
  onProductChange
}: SkuActionCellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  // Tránh hydration mismatch khi dùng createPortal: chỉ render portal ở client.
  useEffect(() => {
    setMounted(true);
  }, []);

  const isAddStock = decision?.action === "add_stock";
  const selectedProduct = useMemo(() => {
    if (!decision?.productId) return null;
    return preferred.find((p) => p.id === decision.productId) ?? null;
  }, [decision?.productId, preferred]);

  // Tính vị trí menu khi mở. Dùng fixed positioning để thoát khỏi table
  // stacking context (z-index của menu sẽ không bị row kế tiếp đè).
  // Đồng thời đảm bảo menu luôn nằm trong viewport.
  const recalcMenuPos = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuHeightEstimate = 130; // 2 buttons × ~60px + margin
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const wantsAbove = spaceBelow < menuHeightEstimate && spaceAbove > spaceBelow;
    const top = wantsAbove ? rect.top - menuHeightEstimate - 4 : rect.bottom + 4;
    setMenuPos({ top, left: rect.left, width: rect.width });
  };

  useLayoutEffect(() => {
    if (menuOpen) {
      recalcMenuPos();
    }
  }, [menuOpen]);

  // Đóng menu khi scroll (modal là scrollable, menu cần close để tránh
  // trôi theo scroll). Picker cũng vậy.
  useEffect(() => {
    if (!menuOpen && !pickerOpen) return;
    const handler = () => {
      if (menuOpen) setMenuOpen(false);
      if (pickerOpen) setPickerOpen(false);
    };
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [menuOpen, pickerOpen]);

  // Close menu/picker khi click ngoài.
  useEffect(() => {
    if (!menuOpen && !pickerOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        menuOpen &&
        menuRef.current &&
        target &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        target !== buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
      if (pickerOpen && pickerRef.current && target && !pickerRef.current.contains(target)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen, pickerOpen]);

  // Đóng menu khi mở picker và ngược lại (chỉ 1 popup tại 1 thời điểm).
  const openMenu = () => {
    setPickerOpen(false);
    setMenuOpen((v) => !v);
  };
  const openPicker = () => {
    setMenuOpen(false);
    setPickerOpen((v) => !v);
  };

  const handlePickExisting = () => {
    setMenuOpen(false);
    onActionChange("add_stock");
    // Nếu đã có productId (vd auto-resolved từ SKU) → không cần mở picker.
    if (!decision?.productId) {
      setPickerOpen(true);
    }
  };

  const handlePickNew = () => {
    setMenuOpen(false);
    onProductChange(null);
    onActionChange("new");
  };

  // Menu content (dùng cả inline và portal — portal để tránh stacking).
  const menuContent = menuOpen && menuPos ? (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: menuPos.top,
        left: menuPos.left,
        width: menuPos.width,
        zIndex: 9999
      }}
      className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl"
    >
      <button
        type="button"
        onClick={handlePickExisting}
        className={`flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-xs transition hover:bg-emerald-50 ${
          isAddStock ? "bg-emerald-50/50" : ""
        }`}
      >
        <Check
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            isAddStock ? "text-emerald-600" : "text-slate-300"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900">
            Đã có sản phẩm này trong danh sách sản phẩm
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Chọn sản phẩm có sẵn để cộng tồn kho. Có thể tìm nhanh theo mã SKU hoặc tên.
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={handlePickNew}
        className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs transition hover:bg-blue-50 ${
          !isAddStock ? "bg-blue-50/50" : ""
        }`}
      >
        <Plus
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            !isAddStock ? "text-blue-600" : "text-slate-300"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900">
            Sản phẩm này chưa có trong danh sách sản phẩm
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Tạo mới sản phẩm khi nhập kho
            {name ? ` với tên "${name.slice(0, 40)}${name.length > 40 ? "…" : ""}"` : ""}
            {sku ? ` · SKU ${sku}` : ""}.
          </div>
        </div>
      </button>
    </div>
  ) : null;

  return (
    <div
      className="relative -mx-1 cursor-pointer rounded-md px-1 py-0.5 hover:bg-slate-50"
      onClick={(e) => {
        // Bắt click vào bất kỳ vùng nào của cell (kể cả padding) → mở menu
        // 2 options. Nếu click trúng button/input bên trong thì KHÔNG mở
        // thêm (đã có onClick riêng).
        const target = e.target as HTMLElement;
        if (target.closest("button, input, a")) return;
        openMenu();
      }}
    >
      {/* Badge chính — click để mở menu 2 options */}
      <button
        ref={buttonRef}
        type="button"
        onClick={openMenu}
        className={`group flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition ${
          !isAddStock
            ? "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
            : selectedProduct
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300"
        }`}
        title="Bấm để chọn: đã có sản phẩm trong danh sách hay tạo mới"
      >
        {isAddStock ? (
          selectedProduct ? (
            <>
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold" title={selectedProduct.name}>
                  {selectedProduct.name}
                </span>
                <span className="block truncate font-mono text-[10.5px] text-emerald-600">
                  SKU {selectedProduct.sku || "—"}
                  {selectedProduct.unit ? ` · ${selectedProduct.unit}` : ""} · tồn {selectedProduct.stock}
                </span>
              </span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-medium">
                Bấm để chọn sản phẩm có sẵn
              </span>
            </>
          )
        ) : (
          <>
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate font-medium">
              Sẽ tạo mới khi nhập
              {sku ? <span className="ml-1 font-mono text-[10.5px]">SKU {sku}</span> : null}
            </span>
          </>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${menuOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Menu 2 options — render qua portal để tránh table stacking context
          (trước đây menu ở hàng cuối bị row kế tiếp đè do z-index không thoát
          được khỏi table-row). */}
      {mounted && menuContent ? createPortal(menuContent, document.body) : null}

      {/* Search dropdown cho action "Đã có" */}
      {pickerOpen ? (
        <div
          ref={pickerRef}
          className="absolute left-0 right-0 top-full z-20 mt-1"
        >
          <ProductPicker
            rowId={rowId}
            sku={sku}
            name={name}
            preferred={preferred}
            value={decision?.productId ?? null}
            onChange={(pid) => {
              onProductChange(pid);
              // Không đóng picker để user có thể đổi ý — chỉ đóng khi click outside
              // hoặc chọn 1 option rồi bấm X bên dưới.
            }}
            onClose={() => setPickerOpen(false)}
            inline
          />
        </div>
      ) : null}

      {/* Phụ: nút mở search khi đã chọn action = add_stock */}
      {isAddStock && !menuOpen && !pickerOpen ? (
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={openPicker}
            className="font-semibold text-blue-600 hover:underline"
          >
            {selectedProduct ? "Đổi sản phẩm" : "Chọn sản phẩm"}
          </button>
          {selectedProduct ? (
            <button
              type="button"
              onClick={() => {
                onProductChange(null);
                onActionChange("new");
              }}
              className="font-semibold text-amber-700 hover:underline"
              title="Chuyển sang tạo mới"
            >
              Bỏ chọn → tạo mới
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------------
// ProductPicker: dropdown tìm sản phẩm theo tên/SKU. Khi `inline=true` (dùng
// trong SkuActionCell mới) thì dropdown luôn mở và có nút X để đóng; khi
// `inline=false` thì hoạt động như trước (toggle).
// ----------------------------------------------------------------------------

interface ProductPickerProps {
  rowId: string;
  sku: string;
  name: string;
  preferred: MatchedProduct[];
  value: string | null;
  onChange: (productId: string | null) => void;
  inline?: boolean;
  onClose?: () => void;
}

function ProductPicker({ rowId, sku, name, preferred, value, onChange, inline = false, onClose }: ProductPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MatchedProduct[]>([]);
  const [exact, setExact] = useState<MatchedProduct | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(inline);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Khi inline=true thì luôn mở.
  useEffect(() => {
    if (inline) setOpen(true);
  }, [inline]);

  const selected =
    preferred.find((p) => p.id === value) ??
    results.find((p) => p.id === value) ??
    (exact?.id === value ? exact : null);

  // Live search khi user gõ. Ưu tiên SKU của dòng này làm exact-match hint.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const url = new URL("/api/products/search", window.location.origin);
      url.searchParams.set("q", query.trim());
      url.searchParams.set("sku", sku.trim());
      url.searchParams.set("limit", "15");
      setSearching(true);
      fetch(url.toString())
        .then((r) => r.json().catch(() => ({})))
        .then((body: SearchApiResponse) => {
          setExact(body?.exact ?? null);
          setResults(Array.isArray(body?.results) ? body.results : []);
        })
        .catch(() => undefined)
        .finally(() => setSearching(false));
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query, sku]);

  // Lần đầu mở: query rỗng → gọi search với SKU của dòng để dropdown không bao giờ trống.
  useEffect(() => {
    if (!open) return;
    if (query.length > 0) return;
    const url = new URL("/api/products/search", window.location.origin);
    url.searchParams.set("q", "");
    url.searchParams.set("sku", sku.trim());
    url.searchParams.set("limit", "15");
    setSearching(true);
    fetch(url.toString())
      .then((r) => r.json().catch(() => ({})))
      .then((body: SearchApiResponse) => {
        setExact(body?.exact ?? null);
        setResults(Array.isArray(body?.results) ? body.results : []);
      })
      .catch(() => undefined)
      .finally(() => setSearching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-pick exact match nếu user chưa chọn (server `preferred` đã có sẵn; picker chỉ re-expose).
  useEffect(() => {
    if (value) return;
    if (exact) onChange(exact.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exact?.id]);

  // Merge options: preferred (server) trước để giữ ordering, rồi live results mới.
  const merged: MatchedProduct[] = [];
  const seen = new Set<string>();
  const push = (p: MatchedProduct) => {
    if (!p || seen.has(p.id)) return;
    seen.add(p.id);
    merged.push(p);
  };
  preferred.forEach(push);
  [exact, ...results].forEach((p) => p && push(p));

  const hasOptions = merged.length > 0;

  // ─── Inline mode (modal mới) ─────────────────────────────────────────────
  if (inline) {
    return (
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Tìm sản phẩm theo tên hoặc SKU${sku ? ` (gợi ý SKU "${sku}")` : ""}…`}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
          />
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onClose?.();
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng dropdown chọn sản phẩm"
            title="Đóng"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="max-h-64 overflow-auto py-1">
          {!hasOptions && !searching ? (
            <div className="px-3 py-4 text-center text-xs text-slate-500">
              Không tìm thấy sản phẩm phù hợp
              {sku ? ` với SKU "${sku}"` : ""}.<br />
              Hãy thử gõ tên khác hoặc chọn "Chưa có trong danh sách".
            </div>
          ) : (
            merged.map((p) => {
              const isSelected = p.id === value;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange(p.id)}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                    isSelected ? "bg-blue-50" : ""
                  }`}
                >
                  <Check
                    className={`mt-0.5 h-3.5 w-3.5 ${
                      isSelected ? "text-emerald-600" : "text-transparent"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-900" title={p.name}>
                      {p.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      SKU <span className="font-mono">{p.sku || "—"}</span>
                      {p.unit ? ` · ${p.unit}` : ""} · tồn {p.stock}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5">
          <span className="text-[11px] text-slate-500">
            Đang chọn cho dòng <span className="font-mono">{rowId.slice(0, 6)}…</span>
            {name ? <span className="ml-1">· "{name.slice(0, 30)}{name.length > 30 ? "…" : ""}"</span> : null}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] font-semibold text-amber-700 hover:underline"
            title="Chuyển sang 'Tạo mới'"
          >
            Bỏ chọn → tạo mới
          </button>
        </div>
      </div>
    );
  }

  // ─── Legacy mode (giữ nguyên fallback) ───────────────────────────────────
  return (
    <div className="relative">
      {/* Always-visible summary */}
      <div className="flex items-center gap-1.5 text-xs">
        {selected ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-medium text-emerald-700 truncate" title={selected.name}>
              {selected.name}
            </span>
            <span className="text-slate-500">· tồn {selected.stock}</span>
            <button
              type="button"
              className="ml-auto text-[11px] font-semibold text-blue-600 hover:underline"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Đóng" : merged.length > 1 ? "Đổi" : "Tìm"}
            </button>
          </>
        ) : hasOptions ? (
          <span className="inline-flex items-center gap-1 text-amber-700">
            <Sparkles className="h-3.5 w-3.5" />
            Có {merged.length} sản phẩm có thể khớp
            <button
              type="button"
              className="ml-auto text-[11px] font-semibold text-blue-600 hover:underline"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Đóng" : "Chọn"}
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-slate-500">
            Không có sản phẩm khớp
            <button
              type="button"
              className="ml-auto text-[11px] font-semibold text-blue-600 hover:underline"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Đóng" : "Tìm"}
            </button>
          </span>
        )}
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc SKU…"
              className="flex-1 bg-transparent text-xs outline-none"
            />
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
          </div>
          <div className="max-h-64 overflow-auto py-1">
            {!hasOptions && !searching ? (
              <div className="px-3 py-3 text-center text-xs text-slate-500">
                Không tìm thấy sản phẩm phù hợp.
              </div>
            ) : (
              merged.map((p) => {
                const isSelected = p.id === value;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onChange(p.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                      isSelected ? "bg-blue-50" : ""
                    }`}
                  >
                    <Check
                      className={`mt-0.5 h-3.5 w-3.5 ${
                        isSelected ? "text-emerald-600" : "text-transparent"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900" title={p.name}>
                        {p.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        SKU <span className="font-mono">{p.sku || "—"}</span>
                        {p.unit ? ` · ${p.unit}` : ""} · tồn {p.stock}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5">
            <span className="text-[11px] text-slate-500">
              Đang chọn cho dòng <span className="font-mono">{rowId.slice(0, 6)}…</span>
            </span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[11px] font-semibold text-amber-700 hover:underline"
              title="Chuyển sang 'Tạo mới'"
            >
              Bỏ chọn → tạo mới
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className="absolute -right-1 top-1 hidden"
        aria-hidden
      >
        <ChevronDown className="h-3 w-3" />
      </button>
    </div>
  );
}
