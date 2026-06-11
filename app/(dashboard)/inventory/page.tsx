"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useApp } from "@/components/providers/AppProvider";
import { parseNumeric } from "@/lib/shared/format";
import type { InvoiceRow } from "@/lib/shared/schema";

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

export default function InventoryPage() {
  const { store } = useApp();

  const stockReceiptDrafts = useMemo<StockReceiptDraft[]>(() => {
    const rowsByDocument = new Map<string, InvoiceRow[]>();
    for (const row of store.rows) {
      rowsByDocument.set(row.documentId, [...(rowsByDocument.get(row.documentId) ?? []), row]);
    }

    return store.documents
      .filter((document) => document.status === "scanned")
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
  }, [store.documents, store.rows]);

  return (
    <section className="space-y-5">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Vận hành</div>
            <h2 className="mt-1 text-2xl font-semibold">Tồn kho</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Dữ liệu vận hành lấy từ hóa đơn đã scan: tạo nhanh sản phẩm, sinh phiếu nhập kho nháp và chuẩn bị đồng bộ bán hàng.
            </p>
          </div>
          <Link href="/blueprint" className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted">
            Xem blueprint
          </Link>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Phiếu nhập kho nháp từ hóa đơn scan</div>
            <div className="text-xs text-muted-foreground">Mỗi file hóa đơn tạo một phiếu nhập nháp, lấy tên hàng, số lượng, đơn vị và đơn giá nhập từ OCR.</div>
          </div>
          <Link href="/scan" className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted">
            Scan thêm hóa đơn
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full min-w-[1040px] text-sm">
            <thead>
              <tr>
                {["Số phiếu", "File hóa đơn", "Nhà cung cấp", "Ngày HĐ", "Số HĐ", "Dòng hàng", "Tổng SL", "Tổng nhập", "Trạng thái"].map((header) => (
                  <th key={header} className="px-3 py-2 text-left">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stockReceiptDrafts.map((receipt) => (
                <tr key={receipt.id} className="border-t">
                  <td className="px-3 py-2 font-semibold">{receipt.receiptNumber}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-xs text-muted-foreground" title={receipt.sourceFileName}>{receipt.sourceFileName}</td>
                  <td className="max-w-[280px] truncate px-3 py-2" title={receipt.supplierName}>{receipt.supplierName || "-"}</td>
                  <td className="px-3 py-2 tabular-nums">{receipt.invoiceDate || "-"}</td>
                  <td className="px-3 py-2 tabular-nums">{receipt.invoiceNumber || "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(receipt.itemCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(receipt.totalQuantity)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCurrency(receipt.totalAmount)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${receipt.missingSkuCount === 0 ? "bg-emerald-50 text-emerald-700" : "bg-warning-bg text-warning-foreground"}`}>
                      {receipt.missingSkuCount === 0 ? "Sẵn sàng nhập kho" : `Cần map ${receipt.missingSkuCount} SKU`}
                    </span>
                  </td>
                </tr>
              ))}
              {stockReceiptDrafts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">Chưa có phiếu nhập nháp. Scan hóa đơn để tự tạo.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
