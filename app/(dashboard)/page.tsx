"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";
import type { InvoiceDocument } from "@/lib/shared/schema";

function fmtNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function documentStatusLabel(document: InvoiceDocument) {
  return document.status === "scanned" ? "Đã scan" : "Lỗi OCR";
}

export default function DashboardPage() {
  const { store, loading, setError } = useApp();

  const appliedDocumentIds = new Set(store.documents.filter((document) => document.appliedToSummary).map((document) => document.id));
  const summaryRows = store.rows.filter((row) => appliedDocumentIds.has(row.documentId));
  const invoiceCount = new Set(summaryRows.map((row) => `${row.supplierName}-${row.invoiceNumber}`)).size;
  const errorDocuments = store.documents.filter((document) => document.status === "error").length;
  const missingSku = summaryRows.filter((row) => !String(row.internalProductCode).trim()).length;
  const missingAdjustedName = summaryRows.filter((row) => !String(row.adjustedInvoiceName).trim()).length;

  const exportExcel = async () => {
    if (summaryRows.length === 0) return;

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: summaryRows })
      });
      if (!response.ok) throw new Error("Không xuất được Excel.");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tong-hop-hoa-don.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xuất được Excel.");
    }
  };

  if (loading) {
    return (
      <div className="panel flex min-h-[320px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Đang tải dữ liệu
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="panel flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="section-title">Hóa đơn</div>
          <div className="section-caption mt-0.5">
            {fmtNumber(invoiceCount)} hóa đơn · {fmtNumber(summaryRows.length)} dòng · {fmtNumber(errorDocuments)} lỗi OCR
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/scan" className="rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Scan hóa đơn
          </Link>
          <Link href="/summary" className="rounded-md border bg-white px-3.5 py-2 text-sm font-semibold hover:bg-secondary">
            Tổng hợp
          </Link>
          <button 
            className="rounded-md border bg-white px-3.5 py-2 text-sm font-semibold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50" 
            onClick={exportExcel} 
            disabled={summaryRows.length === 0}
          >
            Xuất Excel
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Hóa đơn scan gần đây</h2>
              <p className="text-xs text-muted-foreground">Dữ liệu lấy từ Supabase/Postgres khi cấu hình DATABASE_URL</p>
            </div>
            <Link href="/scan" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              Upload thêm
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <table className="data-table w-full text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">File</th>
                  <th className="px-3 py-2 text-left">Trạng thái</th>
                  <th className="px-3 py-2 text-right">Dòng</th>
                  <th className="px-3 py-2 text-left">Ngày upload</th>
                </tr>
              </thead>
              <tbody>
                {store.documents.slice(0, 6).map((document) => (
                  <tr key={document.id} className="border-t">
                    <td className="max-w-[320px] truncate px-3 py-2 font-medium">{document.fileName}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${document.status === "scanned" ? "bg-emerald-50 text-emerald-700" : "bg-warning-bg text-warning-foreground"}`}>
                        {documentStatusLabel(document)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{document.rowCount}</td>
                    <td className="px-3 py-2 text-muted-foreground">{document.uploadedAt.slice(0, 10)}</td>
                  </tr>
                ))}
                {store.documents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">Chưa có hóa đơn nào. Bấm Upload thêm để scan.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold">Cảnh báo cần xử lý</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {[
              ["Dòng thiếu MÃ SẢN PHẨM", missingSku],
              ["Dòng thiếu TÊN CHỈNH LẠI", missingAdjustedName],
              ["Tài liệu OCR lỗi", errorDocuments],
              ["Dòng thiếu tên bán lẻ", summaryRows.filter((row) => !String(row.retailName).trim()).length]
            ].map(([label, count]) => (
              <div key={String(label)} className="flex items-center justify-between bg-warning-bg/55 px-4 py-3">
                <div className="text-sm">{label}</div>
                <div className="font-semibold text-warning-foreground tabular-nums">{count}</div>
              </div>
            ))}
          </div>
          <Link href="/summary" className="m-4 block text-center w-[calc(100%-2rem)] rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Mở tổng hợp hóa đơn
          </Link>
        </div>
      </div>
    </section>
  );
}
