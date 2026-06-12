"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import type { AppStore, InvoiceDocument, InvoiceRow } from "@/lib/shared/schema";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
};

type ServerScanJobFileStatus = "queued" | "duplicate" | "restore" | "retry" | "scanning" | "scanned" | "error";
type ServerScanJobStatus = "queued" | "running" | "completed" | "partial" | "failed";

export type ScanJobFileView = {
  id: string;
  fileName: string;
  fileSize: number;
  status: ServerScanJobFileStatus;
  documentId: string;
  rowCount: number;
  originalRowCount: number;
  deletedRowCount: number;
  duplicate: boolean;
  skipped: boolean;
  restored: boolean;
  retried: boolean;
  warnings: string[];
  error: string;
};

type ServerScanJob = {
  id: string;
  status: ServerScanJobStatus;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  updatedAt: string;
  fileCount: number;
  message: string;
  error: string;
  files: ScanJobFileView[];
};

export type ScanBatchFile = {
  document: InvoiceDocument;
  rows: InvoiceRow[];
  selected: boolean;
  skipped?: boolean;
  duplicate?: boolean;
  restored?: boolean;
  retried?: boolean;
};

export type ScanJob = {
  jobId: string;
  status: ServerScanJobStatus | "";
  running: boolean;
  startedAt: string;
  fileCount: number;
  pendingFileNames: string[];
  files: ScanJobFileView[];
  batchFiles: ScanBatchFile[];
  lastMessage: string;
  error: string;
};

export type Lookups = {
  suppliers: string[];
  inputProductNames: string[];
  internalProductCodes: string[];
  adjustedInvoiceNames: string[];
  retailNames: string[];
  units: string[];
  vatRates: string[];
  products: Array<{
    sku: string;
    inputProductName: string;
    adjustedInvoiceName: string;
    retailName: string;
    unit: string;
    salePrice?: string;
    imageUrl?: string;
  }>;
};

const emptyStore: AppStore = { documents: [], rows: [] };
const emptyScanJob: ScanJob = {
  jobId: "",
  status: "",
  running: false,
  startedAt: "",
  fileCount: 0,
  pendingFileNames: [],
  files: [],
  batchFiles: [],
  lastMessage: "",
  error: ""
};
const emptyLookups: Lookups = {
  suppliers: [],
  inputProductNames: [],
  internalProductCodes: [],
  adjustedInvoiceNames: [],
  retailNames: [],
  units: [],
  vatRates: [],
  products: []
};

function terminalScanJobStatus(status: ServerScanJobStatus | "") {
  return status === "completed" || status === "partial" || status === "failed";
}

function scanJobToBatchFiles(job: ServerScanJob, store: AppStore): ScanBatchFile[] {
  const batchFiles: ScanBatchFile[] = [];

  for (const file of job.files) {
    if (!file.documentId) continue;
    const document = store.documents.find((item) => item.id === file.documentId);
    if (!document) continue;
    const rows = store.rows.filter((row) => row.documentId === document.id);
    batchFiles.push({
        document,
        rows,
        selected: document.status === "scanned",
        skipped: file.skipped,
        duplicate: file.duplicate,
        restored: file.restored,
        retried: file.retried
    });
  }

  return batchFiles;
}

function scanJobMessage(job: ServerScanJob) {
  const scanned = job.files.filter((file) => file.status === "scanned").length;
  const duplicate = job.files.filter((file) => file.status === "duplicate").length;
  const errors = job.files.filter((file) => file.status === "error").length;
  const messages = [
    scanned ? `${scanned} file đã OCR.` : "",
    duplicate ? `${duplicate} file trùng bỏ qua OCR.` : "",
    errors ? `${errors} file lỗi OCR.` : ""
  ].filter(Boolean);
  return messages.join(" ") || job.message || "Scan hoàn tất.";
}

function mapServerScanJob(job: ServerScanJob, batchFiles?: ScanBatchFile[]): ScanJob {
  const running = !terminalScanJobStatus(job.status);
  return {
    jobId: job.id,
    status: job.status,
    running,
    startedAt: job.startedAt || job.createdAt,
    fileCount: job.fileCount,
    pendingFileNames: job.files.filter((file) => !["duplicate", "scanned", "error"].includes(file.status)).map((file) => file.fileName),
    files: job.files,
    batchFiles: batchFiles ?? [],
    lastMessage: terminalScanJobStatus(job.status) ? scanJobMessage(job) : job.message,
    error: job.error
  };
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

interface AppContextType {
  store: AppStore;
  setStore: React.Dispatch<React.SetStateAction<AppStore>>;
  lookups: Lookups;
  loading: boolean;
  error: string;
  setError: (msg: string) => void;
  notice: string;
  setNotice: (msg: string) => void;
  confirmAction: (options: ConfirmOptions) => Promise<boolean>;
  refreshLookups: () => Promise<void>;
  scanJob: ScanJob;
  startScanJob: (files: File[]) => Promise<void>;
  setScanBatchFiles: React.Dispatch<React.SetStateAction<ScanBatchFile[]>>;
  productMeta: Record<string, { salePrice: string; imageUrl: string }>;
  setProductMeta: React.Dispatch<React.SetStateAction<Record<string, { salePrice: string; imageUrl: string }>>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<AppStore>(emptyStore);
  const [lookups, setLookups] = useState<Lookups>(emptyLookups);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const pollingJobRef = useRef("");
  const [scanJob, setScanJob] = useState<ScanJob>(emptyScanJob);
  const [productMeta, setProductMeta] = useState<Record<string, { salePrice: string; imageUrl: string }>>({});

  const loadState = async () => {
    const [stateResponse, lookupResponse] = await Promise.all([fetch("/api/state"), fetch("/api/lookups")]);
    const data = await readJsonResponse<AppStore & { error?: string }>(stateResponse);
    const lookupData = await readJsonResponse<Lookups & { error?: string }>(lookupResponse);
    if (!stateResponse.ok) throw new Error(data.error ?? "Không tải được dữ liệu hóa đơn.");
    if (!lookupResponse.ok) throw new Error(lookupData.error ?? "Không tải được danh sách gợi ý.");
    setStore(data);
    setLookups({ ...emptyLookups, ...lookupData });
  };

  const refreshLookups = async () => {
    const response = await fetch("/api/lookups");
    const data = await readJsonResponse<Lookups & { error?: string }>(response);
    if (!response.ok) throw new Error(data.error ?? "Không tải được danh sách gợi ý.");
    setLookups({ ...emptyLookups, ...data });
  };

  const setScanBatchFiles: React.Dispatch<React.SetStateAction<ScanBatchFile[]>> = (value) => {
    setScanJob((current) => ({
      ...current,
      batchFiles: typeof value === "function" ? value(current.batchFiles) : value
    }));
  };

  const finishScanJob = async (job: ServerScanJob) => {
    const stateResponse = await fetch("/api/state");
    const data = await readJsonResponse<AppStore & { error?: string }>(stateResponse);
    if (!stateResponse.ok) throw new Error(data.error ?? "Không tải được dữ liệu sau scan.");

    setStore(data);
    const batchFiles = scanJobToBatchFiles(job, data);
    const lastMessage = scanJobMessage(job);
    setScanJob(mapServerScanJob(job, batchFiles));
    window.localStorage.removeItem("invoiceflow-active-scan-job-id");
    setNotice(lastMessage);
    await refreshLookups();
  };

  const pollScanJob = async (jobId: string) => {
    if (!jobId || pollingJobRef.current === jobId) return;
    pollingJobRef.current = jobId;

    try {
      while (pollingJobRef.current === jobId) {
        const response = await fetch(`/api/scan/jobs/${jobId}`);
        const data = await readJsonResponse<{ job?: ServerScanJob; error?: string }>(response);
        if (!response.ok || !data.job) throw new Error(data.error ?? "Không tải được trạng thái scan.");

        const job = data.job;
        if (terminalScanJobStatus(job.status)) {
          await finishScanJob(job);
          break;
        }

        setScanJob((current) => ({
          ...mapServerScanJob(job, current.batchFiles),
          batchFiles: current.batchFiles
        }));
        await new Promise((resolve) => window.setTimeout(resolve, 1400));
      }
    } catch (pollError) {
      const message = pollError instanceof Error ? pollError.message : "Không tải được trạng thái scan.";
      setScanJob((current) => ({ ...current, running: false, error: message }));
      setError(message);
    } finally {
      if (pollingJobRef.current === jobId) pollingJobRef.current = "";
    }
  };

  const startScanJob = async (files: File[]) => {
    if (scanJob.running) {
      setNotice("Hệ thống đang OCR file hiện tại. Bạn có thể chuyển trang và quay lại xem kết quả.");
      return;
    }

    setError("");
    setNotice("");
    setScanJob({
      jobId: "",
      status: "queued",
      running: true,
      startedAt: new Date().toISOString(),
      fileCount: files.length,
      pendingFileNames: files.map((file) => file.name),
      files: files.map((file, index) => ({
        id: `${file.name}-${index}`,
        fileName: file.name,
        fileSize: file.size,
        status: "queued",
        documentId: "",
        rowCount: 0,
        originalRowCount: 0,
        deletedRowCount: 0,
        duplicate: false,
        skipped: false,
        restored: false,
        retried: false,
        warnings: [],
        error: ""
      })),
      batchFiles: [],
      lastMessage: "",
      error: ""
    });

    const form = new FormData();
    files.forEach((file) => form.append("files", file));

    try {
      const response = await fetch("/api/scan/jobs", { method: "POST", body: form });
      const data = await readJsonResponse<{ job?: ServerScanJob; error?: string }>(response);
      if (!response.ok || !data.job) throw new Error(data.error ?? "Không tạo được job scan.");

      window.localStorage.setItem("invoiceflow-active-scan-job-id", data.job.id);
      setScanJob(mapServerScanJob(data.job));
      void pollScanJob(data.job.id);
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : "Scan thất bại.";
      setScanJob((current) => ({ ...current, running: false, error: message }));
      setError(message);
    }
  };

  useEffect(() => {
    loadState()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Không tải được dữ liệu."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const jobId = window.localStorage.getItem("invoiceflow-active-scan-job-id");
    if (jobId) void pollScanJob(jobId);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("invoiceflow-product-meta");
      if (raw) setProductMeta(JSON.parse(raw));
    } catch {
      setProductMeta({});
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("invoiceflow-product-meta", JSON.stringify(productMeta));
    } catch {
      // Browser storage can be unavailable in private mode.
    }
  }, [productMeta]);

  useEffect(() => {
    if (lookups.products.length === 0) return;
    setProductMeta((current) => {
      const next = { ...current };
      for (const product of lookups.products) {
        if (!product.sku) continue;
        next[`sku:${product.sku}`] = {
          salePrice: product.salePrice ?? "",
          imageUrl: product.imageUrl ?? ""
        };
      }
      return next;
    });
  }, [lookups.products]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(""), 7600);
    return () => window.clearTimeout(timeout);
  }, [error]);

  const confirmAction = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = resolve;
      setConfirmOptions({
        cancelLabel: "Hủy",
        confirmLabel: "Xác nhận",
        tone: "primary",
        ...options
      });
    });

  const closeConfirm = (confirmed: boolean) => {
    confirmResolverRef.current?.(confirmed);
    confirmResolverRef.current = null;
    setConfirmOptions(null);
  };

  return (
    <AppContext.Provider
      value={{
        store,
        setStore,
        lookups,
        loading,
        error,
        setError,
        notice,
        setNotice,
        confirmAction,
        refreshLookups,
        scanJob,
        startScanJob,
        setScanBatchFiles,
        productMeta,
        setProductMeta
      }}
    >
      {children}
      {confirmOptions ? (
        <div className="fixed inset-0 z-[170] grid place-items-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <button className="absolute inset-0" aria-label="Đóng xác nhận" onClick={() => closeConfirm(false)} />
          <div className="relative w-full max-w-md rounded-xl border bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-950">{confirmOptions.title}</div>
            {confirmOptions.description ? (
              <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{confirmOptions.description}</div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => closeConfirm(false)}
              >
                {confirmOptions.cancelLabel}
              </button>
              <button
                type="button"
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                  confirmOptions.tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:opacity-90"
                }`}
                onClick={() => closeConfirm(true)}
              >
                {confirmOptions.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
