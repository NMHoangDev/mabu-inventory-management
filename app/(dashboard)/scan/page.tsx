"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Loader2, ShieldCheck, Trash2, UploadCloud, X } from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";
import type { AppStore, InvoiceDocument } from "@/lib/shared/schema";

type ScanResultMeta = {
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
    return `${documentProgressText(info.document!)} · upload trùng sẽ không scan lại`;
  }
  if (info.status === "restore") {
    return `${documentProgressText(info.document!)} · upload lại để khôi phục ${info.deletedRowCount} dòng đã xóa`;
  }
  if (info.status === "retry") return "Tài liệu từng lỗi OCR, lần này sẽ thử scan lại";
  if (info.status === "checking") return "Đang đối chiếu nội dung file";
  return "Chưa có trong hệ thống";
}

export default function ScanPage() {
  const router = useRouter();
  const { store, setStore, setError, setNotice, refreshLookups } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [files, setFiles] = useState<File[]>([]);
  const [fileHashes, setFileHashes] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);

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
      const results = Array.isArray(data.results) ? (data.results as ScanResultMeta[]) : [];
      const duplicateCount = results.filter((result) => result.duplicate || result.skipped).length;
      const restoredCount = results.filter((result) => result.restored).length;
      const retriedCount = results.filter((result) => result.retried).length;
      const messages = [
        duplicateCount ? `${duplicateCount} file trùng đã được bỏ qua, không OCR lại.` : "",
        restoredCount ? `${restoredCount} file đã được scan lại để khôi phục dòng đã xóa.` : "",
        retriedCount ? `${retriedCount} file lỗi cũ đã được thử scan lại.` : ""
      ].filter(Boolean);
      setNotice(messages.join(" ") || "Scan hóa đơn thành công!");
      await refreshLookups();
      setFiles([]);
      router.push("/summary");
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Scan thất bại.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <section className="panel grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_420px]">
      <div
        className="flex min-h-[390px] flex-col items-center justify-center border-b border-slate-200 p-8 text-center lg:border-b-0 lg:border-r"
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
          File trùng sẽ không OCR lại. Nếu tài liệu đã bị xóa bớt dòng, upload lại đúng file đó để scan lại và khôi phục dòng đã xóa.
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
          {["Upload", "OCR Gemini", "Lưu tổng hợp"].map((label, index) => (
            <div key={label} className="rounded-md border-l-2 border-l-primary bg-secondary/50 px-3 py-2 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bước {index + 1}</div>
              <div className="mt-1 text-sm font-medium">{label}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
          <Link
            href="/sales"
            className="rounded-md border bg-white px-3 py-2 text-left text-sm hover:bg-secondary"
          >
            <div className="font-semibold">Tạo sản phẩm nhanh</div>
            <div className="mt-1 text-xs text-muted-foreground">SKU, tên bán lẻ, đơn vị và giá nhập lấy từ hóa đơn.</div>
          </Link>
          <Link
            href="/inventory"
            className="rounded-md border bg-white px-3 py-2 text-left text-sm hover:bg-secondary"
          >
            <div className="font-semibold">Sinh phiếu nhập kho</div>
            <div className="mt-1 text-xs text-muted-foreground">Mỗi file scan tạo một phiếu nhập nháp.</div>
          </Link>
        </div>
      </div>

      <aside className="overflow-hidden flex flex-col">
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
                        : "Đang OCR và lưu vào tổng hợp"}
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
          )})}
          {queuedFiles.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Chưa có file nào trong hàng đợi.</div>
          ) : null}
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
    </section>
  );
}
