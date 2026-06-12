"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileText, History, Loader2, ShieldCheck, Table2, Trash2, UploadCloud, X } from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";
import type { AppStore, InvoiceDocument, InvoiceRow } from "@/lib/shared/schema";

type ScanResultMeta = {
  document?: InvoiceDocument;
  rows?: InvoiceRow[];
  skipped?: boolean;
  duplicate?: boolean;
  restored?: boolean;
  retried?: boolean;
};

type QueuedFileStatus = "checking" | "new" | "duplicate" | "restore" | "retry";

type QueuedFileInfo = {
  file: File;
  signature: string;
  hash: string;
  status: QueuedFileStatus;
  document?: InvoiceDocument;
  activeRowCount: number;
  deletedRowCount: number;
};

type ScanBatchFile = {
  document: InvoiceDocument;
  rows: InvoiceRow[];
  selected: boolean;
  skipped?: boolean;
  duplicate?: boolean;
  restored?: boolean;
  retried?: boolean;
};

function fileSizeLabel(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function documentProgressText(document: InvoiceDocument) {
  const original = document.originalRowCount || document.rowCount;
  if (document.deletedRowCount > 0) return `${document.rowCount}/${original} dòng · đã xóa ${document.deletedRowCount}`;
  return `${document.rowCount} dòng`;
}

function fileSignature(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

async function fileSha256(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 180);
    throw new Error(
      response.ok
        ? `API không trả JSON hợp lệ. ${preview}`
        : `API lỗi ${response.status}. ${preview || response.statusText}`
    );
  }
}

function getQueuedFileStatus(file: File, hash: string, store: AppStore): QueuedFileInfo {
  const document = hash ? store.documents.find((item) => item.id === hash) : undefined;
  const activeRowCount = hash ? store.rows.filter((row) => row.documentId === hash).length : 0;
  const originalRowCount = document?.originalRowCount || document?.rowCount || 0;
  const deletedRowCount = document ? Math.max(document.deletedRowCount ?? 0, originalRowCount - activeRowCount) : 0;

  let status: QueuedFileStatus = hash ? "new" : "checking";
  if (document?.status === "error") status = "retry";
  else if (document && deletedRowCount > 0) status = "restore";
  else if (document) status = "duplicate";

  return {
    file,
    signature: fileSignature(file),
    hash,
    status,
    document,
    activeRowCount,
    deletedRowCount
  };
}

function queuedFileBadge(info: QueuedFileInfo) {
  if (info.status === "checking") return { label: "Đang kiểm tra", className: "bg-slate-100 text-slate-600" };
  if (info.status === "duplicate") return { label: "Đã có - bỏ qua OCR", className: "bg-emerald-50 text-emerald-700" };
  if (info.status === "restore") return { label: "Đã xóa dòng - scan khôi phục", className: "bg-amber-50 text-amber-700" };
  if (info.status === "retry") return { label: "Lỗi cũ - scan lại", className: "bg-red-50 text-red-700" };
  return { label: "File mới - sẽ OCR", className: "bg-blue-50 text-blue-700" };
}

function queuedFileHint(info: QueuedFileInfo) {
  if (info.status === "duplicate") {
    const applied = info.document?.appliedToSummary ? "đã áp dụng vào tổng hợp" : "chưa áp dụng vào tổng hợp";
    return `${documentProgressText(info.document!)} · ${applied}`;
  }
  if (info.status === "restore") {
    return `${documentProgressText(info.document!)} · upload lại để khôi phục ${info.deletedRowCount} dòng đã xóa`;
  }
  if (info.status === "retry") return "Tài liệu từng lỗi OCR, lần này sẽ thử scan lại";
  if (info.status === "checking") return "Đang đối chiếu nội dung file";
  return "Chưa có trong hệ thống";
}

function scanResultsToBatchFiles(results: ScanResultMeta[], store: AppStore): ScanBatchFile[] {
  const batchFiles: ScanBatchFile[] = [];

  for (const result of results) {
    if (!result.document) continue;
    const document = store.documents.find((item) => item.id === result.document?.id) ?? result.document;
    const rows = store.rows.filter((row) => row.documentId === document.id);
    batchFiles.push({
      document,
      rows: result.rows?.length ? result.rows : rows,
      selected: document.status === "scanned",
      skipped: result.skipped,
      duplicate: result.duplicate,
      restored: result.restored,
      retried: result.retried
    });
  }

  return batchFiles;
}

function documentApplyBadge(document: InvoiceDocument) {
  if (document.status === "error") return { label: "Lỗi OCR", className: "bg-red-50 text-red-700" };
  if (document.appliedToSummary) return { label: "Đã áp dụng", className: "bg-emerald-50 text-emerald-700" };
  return { label: "Chưa áp dụng", className: "bg-blue-50 text-blue-700" };
}

function documentStatusLabel(document: InvoiceDocument) {
  return document.status === "scanned" ? "Đã scan" : "Lỗi OCR";
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

export default function ScanPage() {
  const { store, setStore, setError, setNotice, refreshLookups } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [fileHashes, setFileHashes] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const [applyingDocuments, setApplyingDocuments] = useState(false);
  const [scanBatchFiles, setScanBatchFiles] = useState<ScanBatchFile[]>([]);
  const [documentPanelOpen, setDocumentPanelOpen] = useState(false);
  const [selectedPanelDocumentIds, setSelectedPanelDocumentIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const missing = files.filter((file) => !fileHashes[fileSignature(file)]);
    if (missing.length === 0) return;

    Promise.all(
      missing.map(async (file) => {
        const signature = fileSignature(file);
        const hash = await fileSha256(file);
        return [signature, hash] as const;
      })
    )
      .then((entries) => {
        if (cancelled) return;
        setFileHashes((current) => {
          const next = { ...current };
          for (const [signature, hash] of entries) next[signature] = hash;
          return next;
        });
      })
      .catch((hashError) => setError(hashError instanceof Error ? hashError.message : "Không kiểm tra được file trùng."));

    return () => {
      cancelled = true;
    };
  }, [files, fileHashes, setError]);

  const queuedFiles = useMemo(
    () => files.map((file) => getQueuedFileStatus(file, fileHashes[fileSignature(file)] ?? "", store)),
    [fileHashes, files, store]
  );

  const queuedStats = useMemo(
    () => ({
      newCount: queuedFiles.filter((item) => item.status === "new").length,
      duplicateCount: queuedFiles.filter((item) => item.status === "duplicate").length,
      restoreCount: queuedFiles.filter((item) => item.status === "restore").length,
      retryCount: queuedFiles.filter((item) => item.status === "retry").length,
      checkingCount: queuedFiles.filter((item) => item.status === "checking").length
    }),
    [queuedFiles]
  );

  const recentDocuments = useMemo(() => store.documents.slice(0, 8), [store.documents]);
  const selectedBatchFiles = useMemo(
    () => scanBatchFiles.filter((item) => item.selected && item.document.status === "scanned"),
    [scanBatchFiles]
  );
  const selectedDocumentIds = useMemo(() => selectedBatchFiles.map((item) => item.document.id), [selectedBatchFiles]);
  const selectedApplyDocumentIds = useMemo(
    () => selectedBatchFiles.filter((item) => !item.document.appliedToSummary).map((item) => item.document.id),
    [selectedBatchFiles]
  );
  const selectedRows = useMemo(() => {
    const selectedIds = new Set(selectedDocumentIds);
    return store.rows.filter((row) => selectedIds.has(row.documentId));
  }, [selectedDocumentIds, store.rows]);
  const selectablePanelDocumentIds = useMemo(
    () => store.documents.filter((document) => document.status === "scanned").map((document) => document.id),
    [store.documents]
  );
  const selectedPanelDocumentIdSet = useMemo(() => new Set(selectedPanelDocumentIds), [selectedPanelDocumentIds]);
  const selectedPanelDocuments = useMemo(
    () => store.documents.filter((document) => selectedPanelDocumentIdSet.has(document.id)),
    [selectedPanelDocumentIdSet, store.documents]
  );
  const selectedPanelApplyDocumentIds = useMemo(
    () => selectedPanelDocuments.filter((document) => document.status === "scanned" && !document.appliedToSummary).map((document) => document.id),
    [selectedPanelDocuments]
  );
  const selectedPanelRows = useMemo(
    () => store.rows.filter((row) => selectedPanelDocumentIdSet.has(row.documentId)),
    [selectedPanelDocumentIdSet, store.rows]
  );

  const setPanelDocumentSelected = (documentId: string, checked: boolean) => {
    setSelectedPanelDocumentIds((current) => {
      if (checked) return Array.from(new Set([...current, documentId]));
      return current.filter((id) => id !== documentId);
    });
  };

  const togglePanelDocumentSelection = (documentId: string) => {
    setSelectedPanelDocumentIds((current) =>
      current.includes(documentId) ? current.filter((id) => id !== documentId) : [...current, documentId]
    );
  };

  const toggleAllPanelDocuments = () => {
    setSelectedPanelDocumentIds((current) => {
      const selectable = new Set(selectablePanelDocumentIds);
      const selectedSelectableCount = current.filter((id) => selectable.has(id)).length;
      if (selectablePanelDocumentIds.length > 0 && selectedSelectableCount === selectablePanelDocumentIds.length) return [];
      return selectablePanelDocumentIds;
    });
  };

  const addFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    setFiles((current) => {
      const signatures = new Set(current.map(fileSignature));
      return [
        ...current,
        ...incoming.filter((file) => {
          const signature = fileSignature(file);
          if (signatures.has(signature)) return false;
          signatures.add(signature);
          return true;
        })
      ];
    });
    setError("");
    setNotice("");
  };

  const applyDocumentsToSummary = async (documentIds: string[]) => {
    const ids = Array.from(new Set(documentIds));
    const validIds = ids.filter((id) => {
      const document = store.documents.find((item) => item.id === id);
      return document?.status === "scanned" && !document.appliedToSummary;
    });

    if (validIds.length === 0) {
      setError("Chọn ít nhất một file đã scan và chưa áp dụng vào Tổng hợp hóa đơn.");
      return;
    }

    setApplyingDocuments(true);
    setError("");
    try {
      const response = await fetch("/api/documents/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: validIds })
      });
      const data = await readJsonResponse<AppStore & { error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Không áp dụng được tài liệu.");

      setStore(data);
      const nextDocuments = new Map(data.documents.map((document) => [document.id, document]));
      setScanBatchFiles((current) =>
        current.map((item) => ({
          ...item,
          document: nextDocuments.get(item.document.id) ?? item.document
        }))
      );
      setNotice(`Đã áp dụng ${validIds.length} file vào Tổng hợp hóa đơn.`);
      await refreshLookups();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không áp dụng được tài liệu.");
    } finally {
      setApplyingDocuments(false);
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
      const data = await readJsonResponse<AppStore & { error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Không xóa được tài liệu.");
      setStore(data);
      setScanBatchFiles((current) => current.filter((item) => item.document.id !== documentId));
      setSelectedPanelDocumentIds((current) => current.filter((id) => id !== documentId));
      setNotice(document ? `Đã xóa tài liệu ${document.fileName} và các dòng thuộc file.` : "Đã xóa tài liệu.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không xóa được tài liệu.");
    }
  };

  const exportRowsToExcel = async (rows: InvoiceRow[], fileName: string) => {
    if (rows.length === 0) {
      setError("Chọn ít nhất một file đã scan có dòng hàng để xuất Excel.");
      return;
    }

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows })
      });
      if (!response.ok) throw new Error("Không xuất được Excel.");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không xuất được Excel.");
    }
  };

  const exportSelectedScanBatchExcel = async () => exportRowsToExcel(selectedRows, "ket-qua-scan-hoa-don.xlsx");

  const exportSelectedPanelExcel = async () => exportRowsToExcel(selectedPanelRows, "hoa-don-da-scan-da-chon.xlsx");

  const applySelectedScanBatch = async () => applyDocumentsToSummary(selectedApplyDocumentIds);

  const applySelectedPanelDocuments = async () => applyDocumentsToSummary(selectedPanelApplyDocumentIds);

  const scanFiles = async () => {
    if (files.length === 0) {
      setError("Chọn ít nhất một file PDF hoặc ảnh.");
      return;
    }

    setScanning(true);
    setError("");
    setNotice("");
    const form = new FormData();
    files.forEach((file) => form.append("files", file));

    try {
      const response = await fetch("/api/scan", { method: "POST", body: form });
      const data = await readJsonResponse<AppStore & { error?: string; results?: ScanResultMeta[] }>(response);
      if (!response.ok) throw new Error(data.error ?? "Scan thất bại.");

      setStore(data);
      const results = Array.isArray(data.results) ? data.results : [];
      const nextBatchFiles = scanResultsToBatchFiles(results, data);
      setScanBatchFiles(nextBatchFiles);
      const scannedDocumentIds = nextBatchFiles.filter((item) => item.document.status === "scanned").map((item) => item.document.id);
      setSelectedPanelDocumentIds(scannedDocumentIds);
      if (nextBatchFiles.length > 0) setDocumentPanelOpen(true);

      const duplicateCount = results.filter((result) => result.duplicate || result.skipped).length;
      const restoredCount = results.filter((result) => result.restored).length;
      const retriedCount = results.filter((result) => result.retried).length;
      const newCount = results.length - duplicateCount;
      const messages = [
        newCount > 0 ? `${newCount} file đã OCR và lưu kết quả scan.` : "",
        duplicateCount ? `${duplicateCount} file trùng đã được bỏ qua, không OCR lại.` : "",
        restoredCount ? `${restoredCount} file đã được scan lại để khôi phục dòng đã xóa.` : "",
        retriedCount ? `${retriedCount} file lỗi cũ đã được thử scan lại.` : ""
      ].filter(Boolean);

      setNotice(messages.join(" ") || "Scan hóa đơn thành công.");
      await refreshLookups();
      setFiles([]);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Scan thất bại.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <section className="panel grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_420px]">
      <div
        className="flex min-h-[430px] flex-col items-center justify-center border-b border-slate-200 p-8 text-center lg:border-b-0 lg:border-r"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
      >
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent text-primary shadow-soft">
          <UploadCloud className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold">Thả hóa đơn PDF/ảnh vào đây</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Scan sẽ lưu kết quả trước. Sau đó chọn file để xuất Excel riêng hoặc áp dụng vào Tổng hợp hóa đơn.
        </p>
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          multiple
          accept="application/pdf,image/*"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <button className="mt-5 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90" onClick={() => inputRef.current?.click()}>
          Chọn file
        </button>
        <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-3">
          {["Upload", "OCR Gemini", "Lưu kết quả"].map((label, index) => (
            <div key={label} className="rounded-md border-l-2 border-l-primary bg-secondary/50 px-3 py-2 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bước {index + 1}</div>
              <div className="mt-1 text-sm font-medium">{label}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
          <Link href="/products" className="rounded-md border bg-white px-3 py-2 text-left text-sm hover:bg-secondary">
            <div className="font-semibold">Sản phẩm / SKU</div>
            <div className="mt-1 text-xs text-muted-foreground">Sản phẩm kho là luồng riêng, chỉ thêm khi dữ liệu đã đủ.</div>
          </Link>
          <Link href="/inventory" className="rounded-md border bg-white px-3 py-2 text-left text-sm hover:bg-secondary">
            <div className="font-semibold">Kho sản phẩm</div>
            <div className="mt-1 text-xs text-muted-foreground">Dữ liệu kho giữ độc lập với file hóa đơn đã xóa.</div>
          </Link>
        </div>
      </div>

      <aside className="flex flex-col overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="font-semibold">File chờ / đang scan</div>
          {queuedFiles.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700">{queuedStats.newCount} mới</span>
              <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">{queuedStats.duplicateCount} trùng bỏ qua</span>
              <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700">{queuedStats.restoreCount} khôi phục</span>
              <span className="rounded-full bg-red-50 px-2 py-1 font-medium text-red-700">{queuedStats.retryCount} lỗi scan lại</span>
              {queuedStats.checkingCount > 0 ? (
                <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">{queuedStats.checkingCount} đang kiểm tra</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex-1 overflow-auto">
          {scanning ? (
            <div className="m-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 shadow-sm">
              <div className="flex items-center gap-2 font-semibold">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang OCR {queuedFiles.filter((item) => item.status !== "duplicate").length || queuedFiles.length} file
              </div>
              <div className="mt-1 text-blue-600">Có thể chuyển trang, hệ thống vẫn lưu kết quả khi scan xong.</div>
            </div>
          ) : null}

          {queuedFiles.map((info) => {
            const badge = queuedFileBadge(info);
            return (
              <div key={info.signature} className="flex items-start gap-3 border-b border-slate-200 px-5 py-3">
                <FileText className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold" title={info.file.name}>{info.file.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{fileSizeLabel(info.file.size)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                    {info.hash ? <span className="font-mono text-[10px] text-slate-400">{info.hash.slice(0, 10)}</span> : null}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{queuedFileHint(info)}</div>
                  {scanning ? (
                    <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${
                      info.status === "duplicate"
                        ? "bg-emerald-50 text-emerald-700"
                        : info.status === "checking"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-blue-50 text-blue-700"
                    }`}>
                      {info.status === "duplicate" ? <ShieldCheck className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {info.status === "duplicate"
                        ? "Đã có trong hệ thống, bỏ qua OCR"
                        : info.status === "checking"
                          ? "Đang kiểm tra file"
                          : "Đang OCR và lưu kết quả"}
                    </div>
                  ) : null}
                </div>
                <button
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                  disabled={scanning}
                  onClick={() => {
                    setFiles((current) => current.filter((f) => f !== info.file));
                    setFileHashes((current) => {
                      const next = { ...current };
                      delete next[info.signature];
                      return next;
                    });
                  }}
                  aria-label="Xóa khỏi hàng đợi"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          {scanBatchFiles.length > 0 ? (
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">Kết quả vừa scan</div>
                  <div className="mt-0.5 text-xs text-slate-500">Chọn file để xuất Excel riêng hoặc áp dụng vào bảng tổng hợp.</div>
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-primary hover:underline"
                  onClick={() => {
                    const hasUnselected = scanBatchFiles.some((item) => !item.selected && item.document.status === "scanned");
                    setScanBatchFiles((current) => current.map((item) => ({ ...item, selected: item.document.status === "scanned" && hasUnselected })));
                  }}
                >
                  Chọn tất cả
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {scanBatchFiles.map((item) => {
                  const badge = documentApplyBadge(item.document);
                  return (
                    <label
                      key={item.document.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                        item.selected
                          ? "border-primary/50 bg-blue-50 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.12)]"
                          : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-primary"
                        checked={item.selected}
                        disabled={item.document.status !== "scanned"}
                        onChange={(event) =>
                          setScanBatchFiles((current) =>
                            current.map((file) => file.document.id === item.document.id ? { ...file, selected: event.target.checked } : file)
                          )
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold" title={item.document.fileName}>{item.document.fileName}</div>
                        <div className="mt-1 text-xs text-slate-500">{documentProgressText(item.document)}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                          {item.duplicate || item.skipped ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Trùng file</span>
                          ) : null}
                          {item.restored ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">Đã khôi phục dòng</span> : null}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-secondary disabled:opacity-50"
                  disabled={selectedRows.length === 0}
                  onClick={exportSelectedScanBatchExcel}
                >
                  <Download className="h-4 w-4" />
                  Tải Excel file chọn
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  disabled={selectedApplyDocumentIds.length === 0 || applyingDocuments}
                  onClick={applySelectedScanBatch}
                >
                  {applyingDocuments ? <Loader2 className="h-4 w-4 animate-spin" /> : <Table2 className="h-4 w-4" />}
                  {selectedApplyDocumentIds.length ? `Áp dụng ${selectedApplyDocumentIds.length} file` : "Áp dụng vào tổng hợp"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Đã có trong hệ thống</div>
                <div className="mt-0.5 text-xs text-slate-500">Upload trùng sẽ bỏ qua OCR. File chỉ vào Tổng hợp hóa đơn sau khi bấm Áp dụng.</div>
              </div>
              <button
                type="button"
                className="rounded-md border bg-white px-3 py-2 text-sm font-semibold hover:bg-secondary"
                onClick={() => setDocumentPanelOpen(true)}
              >
                Quản lý
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {recentDocuments.map((document) => {
                const badge = documentApplyBadge(document);
                return (
                  <div key={document.id} className="rounded-md border bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold" title={document.fileName}>{document.fileName}</div>
                        <div className="mt-1 text-xs text-slate-500">{fileSizeLabel(document.fileSize)} · {documentProgressText(document)}</div>
                      </div>
                      {document.appliedToSummary ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                      {document.duplicateCount ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                          Trùng {document.duplicateCount} lần
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {recentDocuments.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">Chưa có file nào trong hệ thống.</div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={queuedFiles.length === 0 || scanning || queuedStats.checkingCount > 0}
            onClick={scanFiles}
          >
            {scanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang xử lý OCR...
              </>
            ) : (
              `Bắt đầu scan ${queuedFiles.length} file`
            )}
          </button>
        </div>
      </aside>

      {documentPanelOpen ? (
        <div className="fixed inset-0 z-[85] flex justify-end bg-slate-950/35">
          <button className="absolute inset-0" aria-label="Đóng quản lý tài liệu" onClick={() => setDocumentPanelOpen(false)} />
          <div className="relative z-10 flex h-full w-[min(900px,100vw)] flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
                  <History className="h-4 w-4 text-primary" />
                  Quản lý tài liệu hóa đơn
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {store.documents.length} file · upload trùng tự bỏ qua OCR · xóa file sẽ xóa toàn bộ dòng thuộc file đó
                </div>
              </div>
              <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setDocumentPanelOpen(false)} aria-label="Đóng">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={
                      selectablePanelDocumentIds.length > 0 &&
                      selectablePanelDocumentIds.every((id) => selectedPanelDocumentIdSet.has(id))
                    }
                    onChange={toggleAllPanelDocuments}
                  />
                  Chọn file đã scan
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                    {selectedPanelDocuments.length} file · {selectedPanelRows.length} dòng
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={selectedPanelRows.length === 0}
                    onClick={exportSelectedPanelExcel}
                  >
                    <Download className="h-4 w-4" />
                    Tải Excel file chọn
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={selectedPanelApplyDocumentIds.length === 0 || applyingDocuments}
                    onClick={applySelectedPanelDocuments}
                  >
                    {applyingDocuments ? <Loader2 className="h-4 w-4 animate-spin" /> : <Table2 className="h-4 w-4" />}
                    {selectedPanelApplyDocumentIds.length ? `Áp dụng ${selectedPanelApplyDocumentIds.length} file` : "Áp dụng vào tổng hợp"}
                  </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                File đã scan được lưu ở đây trước. Chỉ file đã bấm áp dụng mới đi vào bảng Tổng hợp hóa đơn.
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {store.documents.map((document) => {
                const badge = documentApplyBadge(document);
                const canSelect = document.status === "scanned";
                const selected = selectedPanelDocumentIdSet.has(document.id);
                return (
                  <div
                    key={document.id}
                    role={canSelect ? "button" : undefined}
                    tabIndex={canSelect ? 0 : undefined}
                    className={`border-b border-slate-200 px-5 py-4 transition ${
                      selected
                        ? "border-l-4 border-l-primary bg-blue-50/80 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.16)]"
                        : canSelect
                          ? "cursor-pointer hover:bg-slate-50"
                          : "opacity-70"
                    }`}
                    onClick={() => {
                      if (canSelect) togglePanelDocumentSelection(document.id);
                    }}
                    onKeyDown={(event) => {
                      if (!canSelect) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        togglePanelDocumentSelection(document.id);
                      }
                    }}
                  >
                    <div className="grid gap-3 md:grid-cols-[28px_minmax(0,1fr)_128px_86px] md:items-start">
                      <div className="pt-1">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                          checked={selected}
                          disabled={!canSelect}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setPanelDocumentSelected(document.id, event.target.checked)}
                          aria-label={`Chọn file ${document.fileName}`}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold" title={document.fileName}>
                          {document.fileName}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {fileSizeLabel(document.fileSize)} · {new Date(document.uploadedAt).toLocaleString("vi-VN")} · {documentProgressText(document)}
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

                      <div className="flex flex-wrap items-center gap-2 md:block md:space-y-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          document.status === "scanned" ? "bg-slate-100 text-slate-700" : "bg-red-50 text-red-700"
                        }`}>
                          {documentStatusLabel(document)}
                        </span>
                        <div className="font-mono text-xs text-slate-400">{document.id.slice(0, 10)}</div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteDocument(document.id);
                          }}
                          title="Xóa tài liệu và các dòng thuộc tài liệu"
                        >
                          <Trash2 className="h-4 w-4" />
                          Xóa
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {store.documents.length === 0 ? (
                <div className="px-5 py-16 text-center text-slate-500">Chưa có tài liệu nào. Chọn file ở màn hình scan để bắt đầu.</div>
              ) : null}
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
              Mẹo: nếu file đã có trong hệ thống, kéo thả lại file đó sẽ không OCR lại. Nếu file từng bị xóa bớt dòng, upload lại đúng file để khôi phục.
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
