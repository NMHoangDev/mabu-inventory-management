"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useApp } from "@/components/providers/AppProvider";
import { parseNumeric } from "@/lib/shared/format";
import type { InvoiceRow } from "@/lib/shared/schema";

type ProductCandidate = {
  id: string;
  rowIds: string[];
  sku: string;
  retailName: string;
  inputProductName: string;
  adjustedInvoiceName: string;
  unit: string;
  purchasePrice: string;
  rowCount: number;
  missing: string[];
};

type StockReceiptDraft = {
  id: string;
  documentId: string;
  receiptNumber: string;
  sourceFileName: string;
  supplierName: string;
  invoiceDate: string;
  invoiceNumber: string;
  itemCount: number;
  totalQuantity: number;
  totalAmount: number;
  missingSkuCount: number;
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function fmtNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function fmtCurrency(value: number) {
  return `${fmtNumber(value)} đ`;
}

export default function SalesPage() {
  const { store } = useApp();

  const appliedDocumentIds = useMemo(
    () => new Set(store.documents.filter((document) => document.appliedToSummary).map((document) => document.id)),
    [store.documents]
  );
  const summaryRows = useMemo(() => store.rows.filter((row) => appliedDocumentIds.has(row.documentId)), [appliedDocumentIds, store.rows]);

  const productCandidates = useMemo<ProductCandidate[]>(() => {
    const grouped = new Map<string, ProductCandidate>();

    for (const row of summaryRows) {
      const sku = cleanText(row.internalProductCode);
      const inputProductName = cleanText(row.inputProductName);
      const adjustedInvoiceName = cleanText(row.adjustedInvoiceName);
      const retailName = cleanText(row.retailName);
      const unit = cleanText(row.unit);
      const purchasePrice = cleanText(row.unitPrice);
      const key = sku ? `sku:${sku}` : `raw:${inputProductName.toLowerCase()}|${unit.toLowerCase()}`;
      const existing = grouped.get(key);
      const missing = [
        sku ? "" : "SKU",
        adjustedInvoiceName ? "" : "tên chỉnh lại",
        retailName ? "" : "tên bán lẻ"
      ].filter(Boolean);

      if (existing) {
        grouped.set(key, {
          ...existing,
          rowIds: [...existing.rowIds, row.id],
          sku: existing.sku || sku,
          inputProductName: existing.inputProductName || inputProductName,
          adjustedInvoiceName: existing.adjustedInvoiceName || adjustedInvoiceName,
          retailName: existing.retailName || retailName,
          unit: existing.unit || unit,
          purchasePrice: existing.purchasePrice || purchasePrice,
          rowCount: existing.rowCount + 1,
          missing: Array.from(new Set([...existing.missing, ...missing]))
        });
      } else {
        grouped.set(key, {
          id: key,
          rowIds: [row.id],
          sku,
          inputProductName,
          adjustedInvoiceName,
          retailName,
          unit,
          purchasePrice,
          rowCount: 1,
          missing
        });
      }
    }

    return Array.from(grouped.values()).sort((first, second) => {
      const firstReady = first.sku && first.adjustedInvoiceName && first.retailName ? 0 : 1;
      const secondReady = second.sku && second.adjustedInvoiceName && second.retailName ? 0 : 1;
      if (firstReady !== secondReady) return firstReady - secondReady;
      return (first.retailName || first.inputProductName).localeCompare(second.retailName || second.inputProductName, "vi", {
        sensitivity: "base"
      });
    });
  }, [summaryRows]);

  const stockReceiptDrafts = useMemo<StockReceiptDraft[]>(() => {
    const rowsByDocument = new Map<string, InvoiceRow[]>();
    for (const row of summaryRows) {
      rowsByDocument.set(row.documentId, [...(rowsByDocument.get(row.documentId) ?? []), row]);
    }

    return store.documents
      .filter((document) => document.status === "scanned" && document.appliedToSummary)
      .map((document) => {
        const rows = rowsByDocument.get(document.id) ?? [];
        const firstRow = rows[0];
        const invoiceNumber = cleanText(firstRow?.invoiceNumber);
        const receiptNumber = `PNK-${invoiceNumber || document.id.slice(0, 8).toUpperCase()}`;
        return {
          id: receiptNumber,
          documentId: document.id,
          receiptNumber,
          sourceFileName: document.fileName,
          supplierName: cleanText(firstRow?.supplierName),
          invoiceDate: cleanText(firstRow?.invoiceDate),
          invoiceNumber,
          itemCount: rows.length,
          totalQuantity: rows.reduce((total, row) => total + (parseNumeric(row.quantity) ?? 0), 0),
          totalAmount: rows.reduce((total, row) => total + (parseNumeric(row.amountBeforeTax) ?? 0), 0),
          missingSkuCount: rows.filter((row) => !cleanText(row.internalProductCode)).length
        };
      })
      .filter((receipt) => receipt.itemCount > 0)
      .sort((first, second) => second.invoiceDate.localeCompare(first.invoiceDate));
  }, [store.documents, summaryRows]);

  return (
    <section className="space-y-5">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Vận hành</div>
            <h2 className="mt-1 text-2xl font-semibold">Lên đơn hàng</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Dữ liệu vận hành lấy từ hóa đơn đã scan: tạo nhanh sản phẩm, sinh phiếu nhập kho nháp và chuẩn bị đồng bộ bán hàng.
            </p>
          </div>
          <Link href="/blueprint" className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted">
            Xem blueprint
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Tạo sản phẩm nhanh</div>
              <div className="text-xs text-muted-foreground">Ưu tiên các dòng đã có SKU và tên bán lẻ.</div>
            </div>
            <Link href="/products" className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted">
              Mở sản phẩm
            </Link>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="data-table w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  {["SKU", "Tên bán lẻ", "ĐVT", "Giá nhập", "Trạng thái"].map((header) => (
                    <th key={header} className="px-3 py-2 text-left">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productCandidates.slice(0, 12).map((product) => (
                  <tr key={product.id} className="border-t">
                    <td className="px-3 py-2 font-semibold">{product.sku || <span className="text-warning-foreground">Cần nhập</span>}</td>
                    <td className="max-w-[280px] truncate px-3 py-2" title={product.retailName || product.inputProductName}>{product.retailName || product.inputProductName || "-"}</td>
                    <td className="px-3 py-2">{product.unit || "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{product.purchasePrice ? fmtCurrency(parseNumeric(product.purchasePrice) ?? 0) : "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${product.missing.length === 0 ? "bg-emerald-50 text-emerald-700" : "bg-warning-bg text-warning-foreground"}`}>
                        {product.missing.length === 0 ? "Tạo được" : `Thiếu ${product.missing.join(", ")}`}
                      </span>
                    </td>
                  </tr>
                ))}
                {productCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">Chưa có sản phẩm từ hóa đơn scan.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Phiếu nhập kho tự động</div>
              <div className="text-xs text-muted-foreground">Sinh nháp theo từng hóa đơn đã scan.</div>
            </div>
            <Link href="/inventory" className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted">
              Mở tồn kho
            </Link>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="data-table w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  {["Số phiếu", "File", "Dòng", "Tổng nhập", "Trạng thái"].map((header) => (
                    <th key={header} className="px-3 py-2 text-left">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockReceiptDrafts.slice(0, 12).map((receipt) => (
                  <tr key={receipt.id} className="border-t">
                    <td className="px-3 py-2 font-semibold">{receipt.receiptNumber}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-xs text-muted-foreground" title={receipt.sourceFileName}>{receipt.sourceFileName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(receipt.itemCount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCurrency(receipt.totalAmount)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${receipt.missingSkuCount === 0 ? "bg-emerald-50 text-emerald-700" : "bg-warning-bg text-warning-foreground"}`}>
                        {receipt.missingSkuCount === 0 ? "Nháp hợp lệ" : `Thiếu ${receipt.missingSkuCount} SKU`}
                      </span>
                    </td>
                  </tr>
                ))}
                {stockReceiptDrafts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">Chưa có phiếu nhập kho nháp.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
