"use client";

import Link from "next/link";
import { History, Plus, Table2, Trash2 } from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";
import type { AppStore, InvoiceDocument } from "@/lib/shared/schema";

function fileSizeLabel(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function documentStatusLabel(document: InvoiceDocument) {
  return document.status === "scanned" ? "Đã scan" : "Lỗi OCR";
}

function documentProgressText(document: InvoiceDocument) {
  const original = document.originalRowCount || document.rowCount;
  if (document.deletedRowCount > 0) return `${document.rowCount}/${original} dòng · đã xóa ${document.deletedRowCount}`;
  return `${document.rowCount} dòng`;
}

function documentDuplicateText(document: InvoiceDocument) {
  if (!document.duplicateCount) return "";
  const time = document.lastDuplicateAt ? ` · gần nhất ${new Date(document.lastDuplicateAt).toLocaleString("vi-VN")}` : "";
  return `Upload trùng ${document.duplicateCount} lần${time}`;
}

function isSignatureInfo(message: string) {
  const lower = String(message ?? "").toLowerCase();
  return lower.includes("signature valid") || lower.includes("chữ ký số hợp lệ");
}

function displayDocumentMessage(message: string) {
  return isSignatureInfo(message) ? "Chữ ký số hợp lệ" : String(message ?? "");
}

function documentMessageClass(message: string) {
  return isSignatureInfo(message)
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
    : "bg-honey-50 text-amber-800 ring-1 ring-amber-100";
}

export default function DocumentsPage() {
  const { store, setStore, setNotice, setError } = useApp();

  const readJsonResponse = async (response: Response) => {
    const text = await response.text();
    try {
      return JSON.parse(text) as AppStore & { error?: string };
    } catch {
      throw new Error(response.ok ? "API không trả JSON hợp lệ." : `API lỗi ${response.status}.`);
    }
  };

  const applyDocument = async (documentId: string) => {
    const document = store.documents.find((item) => item.id === documentId);
    try {
      const response = await fetch("/api/documents/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: [documentId] })
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? "Không áp dụng được tài liệu.");
      setStore(data);
      setNotice(document ? `Đã áp dụng ${document.fileName} vào Tổng hợp hóa đơn.` : "Đã áp dụng tài liệu.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không áp dụng được tài liệu.");
    }
  };

  const deleteDocument = async (documentId: string) => {
    const document = store.documents.find((item) => item.id === documentId);
    const activeRows = store.rows.filter((row) => row.documentId === documentId).length;
    const deletedRows = document?.deletedRowCount ?? 0;
    const fileName = document?.fileName ?? "tài liệu này";
    const confirmMessage = [
      `Xóa file "${fileName}"?`,
      document?.appliedToSummary
        ? `Toàn bộ ${activeRows} dòng đang có trong bảng tổng hợp sẽ bị xóa theo file này.`
        : `Toàn bộ ${activeRows} dòng scan đang lưu tạm của file này sẽ bị xóa.`,
      deletedRows ? `File này trước đó đã xóa thủ công ${deletedRows} dòng.` : "",
      "Hành động này chỉ nên dùng khi scan nhầm hoặc không cần giữ file."
    ]
      .filter(Boolean)
      .join("\n");
    if (!window.confirm(confirmMessage)) return;

    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(response.ok ? "API không trả JSON hợp lệ." : `API lỗi ${response.status}.`);
      }
      
      if (!response.ok) throw new Error(data.error ?? "Không xóa được tài liệu.");
      setStore(data);
      setNotice(document ? `Đã xóa tài liệu ${document.fileName} và các dòng thuộc file.` : "Đã xóa tài liệu.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xóa được tài liệu.");
    }
  };

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <History className="h-4 w-4 text-primary" />
          Lịch sử và quản lý tài liệu
        </div>
        <Link href="/scan" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          <Plus className="h-4 w-4" />
          Thêm tài liệu
        </Link>
      </div>
      <div className="divide-y divide-slate-200">
        {store.documents.map((document) => (
          <div key={document.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_120px_120px_130px_120px_112px] md:items-center">
            <div className="min-w-0">
              <div className="truncate font-semibold">{document.fileName}</div>
              <div className="mt-1 text-sm text-slate-500">
                {fileSizeLabel(document.fileSize)} · {new Date(document.uploadedAt).toLocaleString("vi-VN")}
              </div>
              {documentDuplicateText(document) ? (
                <div className="mt-1 text-xs font-medium text-slate-500">{documentDuplicateText(document)}</div>
              ) : null}
              {document.deletedRowCount > 0 ? (
                <div className="mt-1 text-xs font-medium text-amber-700">
                  Đã xóa thủ công {document.deletedRowCount} dòng. Upload lại đúng file này để scan lại và khôi phục dòng đã xóa.
                </div>
              ) : null}
              {document.warnings.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {document.warnings.map((message, index) => (
                    <span key={`${message}-${index}`} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${documentMessageClass(message)}`}>
                      {displayDocumentMessage(message)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="text-sm text-slate-600">{documentStatusLabel(document)}</div>
            <div className={`text-sm ${document.deletedRowCount > 0 ? "font-semibold text-amber-700" : "text-slate-600"}`}>
              {documentProgressText(document)}
            </div>
            <div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                document.appliedToSummary ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
              }`}>
                {document.appliedToSummary ? "Đã áp dụng" : "Chưa áp dụng"}
              </span>
            </div>
            <div className="font-mono text-xs text-slate-400">{document.id.slice(0, 10)}</div>
            <div className="flex items-center justify-end gap-1">
              {!document.appliedToSummary && document.status === "scanned" ? (
                <button
                  className="rounded-lg p-2 text-primary hover:bg-blue-50"
                  onClick={() => applyDocument(document.id)}
                  title="Áp dụng vào Tổng hợp hóa đơn"
                >
                  <Table2 className="h-4 w-4" />
                </button>
              ) : null}
              <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => deleteDocument(document.id)} title="Xóa tài liệu và các dòng thuộc tài liệu">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {store.documents.length === 0 ? <div className="px-5 py-12 text-center text-slate-500">Chưa có tài liệu.</div> : null}
      </div>
    </section>
  );
}
