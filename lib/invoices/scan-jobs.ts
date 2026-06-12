import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fixMojibakeText } from "../shared/format";
import type { InvoiceDocument } from "../shared/schema";
import { markDuplicateDocument, readStore, upsertDocumentWithRows } from "./repository";
import { scanUploadedFile } from "./ocr";

type ScanJobStatus = "queued" | "running" | "completed" | "partial" | "failed";
type ScanJobFileStatus = "queued" | "duplicate" | "restore" | "retry" | "scanning" | "scanned" | "error";

export type ScanJobFile = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  localPath: string;
  status: ScanJobFileStatus;
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
  startedAt: string;
  finishedAt: string;
  updatedAt: string;
};

export type ScanJobRecord = {
  id: string;
  status: ScanJobStatus;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  updatedAt: string;
  fileCount: number;
  message: string;
  error: string;
  files: ScanJobFile[];
};

declare global {
  // eslint-disable-next-line no-var
  var invoiceflowActiveScanJobs: Set<string> | undefined;
  // eslint-disable-next-line no-var
  var invoiceflowScanJobWriteQueue: Promise<void> | undefined;
}

const dataDir =
  process.env.INVOICEFLOW_DATA_DIR ??
  (process.env.VERCEL ? path.join(os.tmpdir(), "invoiceflow") : path.join(process.cwd(), "data"));
const scanJobDir = path.join(dataDir, "scan-jobs");
const scanJobFile = path.join(scanJobDir, "jobs.json");
const maxScanJobFiles = Number(process.env.MAX_SCAN_JOB_FILES ?? 20);
const scanJobConcurrency = Math.max(1, Number(process.env.SCAN_JOB_CONCURRENCY ?? process.env.OCR_CONCURRENCY ?? 2));

const activeJobs = globalThis.invoiceflowActiveScanJobs ?? (globalThis.invoiceflowActiveScanJobs = new Set<string>());

function nowIso() {
  return new Date().toISOString();
}

function extensionFor(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  return ext && ext.length <= 8 ? ext : ".bin";
}

function routeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

function terminalFileStatus(status: ScanJobFileStatus) {
  return status === "duplicate" || status === "scanned" || status === "error";
}

function shouldRunJob(job: ScanJobRecord) {
  return job.files.some((file) => !terminalFileStatus(file.status));
}

async function readJobs(): Promise<Record<string, ScanJobRecord>> {
  try {
    const raw = await fs.readFile(scanJobFile, "utf8");
    return JSON.parse(raw) as Record<string, ScanJobRecord>;
  } catch {
    return {};
  }
}

async function writeJobs(jobs: Record<string, ScanJobRecord>) {
  await fs.mkdir(scanJobDir, { recursive: true });
  await fs.writeFile(scanJobFile, JSON.stringify(jobs, null, 2), "utf8");
}

async function updateJob(jobId: string, updater: (job: ScanJobRecord) => ScanJobRecord | Promise<ScanJobRecord>) {
  const previous = globalThis.invoiceflowScanJobWriteQueue ?? Promise.resolve();
  let updatedJob: ScanJobRecord | undefined;

  globalThis.invoiceflowScanJobWriteQueue = previous.then(async () => {
    const jobs = await readJobs();
    const job = jobs[jobId];
    if (!job) return;
    updatedJob = await updater(job);
    jobs[jobId] = { ...updatedJob, updatedAt: nowIso() };
    await writeJobs(jobs);
  });

  await globalThis.invoiceflowScanJobWriteQueue;
  return updatedJob;
}

async function saveInitialJob(job: ScanJobRecord) {
  const previous = globalThis.invoiceflowScanJobWriteQueue ?? Promise.resolve();
  globalThis.invoiceflowScanJobWriteQueue = previous.then(async () => {
    const jobs = await readJobs();
    jobs[job.id] = job;
    await writeJobs(jobs);
  });
  await globalThis.invoiceflowScanJobWriteQueue;
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index]);
      }
    })
  );
}

async function markJobFile(jobId: string, fileId: string, patch: Partial<ScanJobFile>) {
  await updateJob(jobId, (job) => ({
    ...job,
    files: job.files.map((file) => (file.id === fileId ? { ...file, ...patch, updatedAt: nowIso() } : file))
  }));
}

async function finalizeJob(jobId: string) {
  await updateJob(jobId, (job) => {
    const errorCount = job.files.filter((file) => file.status === "error").length;
    const successCount = job.files.filter((file) => file.status === "scanned" || file.status === "duplicate").length;
    const pendingCount = job.files.filter((file) => !terminalFileStatus(file.status)).length;
    const status: ScanJobStatus =
      pendingCount > 0 ? "running" : errorCount > 0 && successCount > 0 ? "partial" : errorCount > 0 ? "failed" : "completed";
    const messages = [
      successCount > 0 ? `${successCount} file đã xử lý.` : "",
      errorCount > 0 ? `${errorCount} file lỗi OCR.` : ""
    ].filter(Boolean);

    return {
      ...job,
      status,
      finishedAt: status === "running" ? "" : nowIso(),
      message: messages.join(" ") || "Scan hoàn tất."
    };
  });
}

async function processJobFile(jobId: string, file: ScanJobFile) {
  await markJobFile(jobId, file.id, {
    status: "scanning",
    startedAt: nowIso(),
    error: "",
    warnings: []
  });

  try {
    const buffer = await fs.readFile(file.localPath);
    const uploadFile = new File([buffer], file.fileName, { type: file.mimeType || "application/octet-stream" });
    const result = await scanUploadedFile(uploadFile);
    const store = await upsertDocumentWithRows(result.document, result.rows);
    const document = store.documents.find((item) => item.id === result.document.id) ?? result.document;
    const status: ScanJobFileStatus = document.status === "error" ? "error" : "scanned";

    await markJobFile(jobId, file.id, {
      status,
      documentId: document.id,
      rowCount: document.rowCount,
      originalRowCount: document.originalRowCount,
      deletedRowCount: document.deletedRowCount,
      warnings: document.warnings,
      error: document.status === "error" ? document.warnings.join(" ") : "",
      finishedAt: nowIso()
    });
  } catch (error) {
    await markJobFile(jobId, file.id, {
      status: "error",
      error: routeErrorMessage(error),
      warnings: [routeErrorMessage(error)],
      finishedAt: nowIso()
    });
  } finally {
    await fs.unlink(file.localPath).catch(() => undefined);
  }
}

export async function processScanJob(jobId: string) {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);

  try {
    const jobs = await readJobs();
    const job = jobs[jobId];
    if (!job) return;

    await updateJob(jobId, (current) => ({
      ...current,
      status: "running",
      startedAt: current.startedAt || nowIso(),
      message: "Đang OCR tài liệu."
    }));

    const runnableFiles = job.files.filter((file) => !terminalFileStatus(file.status));
    await runWithConcurrency(runnableFiles, scanJobConcurrency, async (file) => {
      await processJobFile(jobId, file);
    });

    await finalizeJob(jobId);
  } finally {
    activeJobs.delete(jobId);
  }
}

export async function getScanJob(jobId: string) {
  const jobs = await readJobs();
  const job = jobs[jobId] ?? null;
  if (job && shouldRunJob(job) && !activeJobs.has(jobId)) {
    void processScanJob(jobId);
  }
  return job;
}

export async function createScanJob(files: File[]) {
  if (files.length === 0) throw new Error("Chọn ít nhất một file PDF hoặc ảnh.");
  if (files.length > maxScanJobFiles) {
    throw new Error(`Mỗi lượt scan tối đa ${maxScanJobFiles} file. Hãy chia nhỏ để OCR ổn định hơn.`);
  }

  const id = randomUUID();
  const createdAt = nowIso();
  const jobUploadDir = path.join(scanJobDir, id);
  await fs.mkdir(jobUploadDir, { recursive: true });

  let store = await readStore();
  const jobFiles: ScanJobFile[] = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const documentId = createHash("sha256").update(buffer).digest("hex");
    const fileName = fixMojibakeText(file.name);
    const existing = store.documents.find((document) => document.id === documentId);
    const activeRowCount = store.rows.filter((row) => row.documentId === documentId).length;
    const deletedRowCount = existing
      ? Math.max(existing.deletedRowCount ?? 0, (existing.originalRowCount || existing.rowCount || 0) - activeRowCount)
      : 0;
    const shouldRestoreDeletedRows = Boolean(existing && existing.status === "scanned" && deletedRowCount > 0);
    const shouldRetryError = Boolean(existing && existing.status === "error");
    const fileId = `${documentId}-${jobFiles.length + 1}`;
    const baseFile = {
      id: fileId,
      fileName,
      fileSize: buffer.byteLength,
      mimeType: file.type || "application/octet-stream",
      documentId,
      rowCount: existing?.rowCount ?? 0,
      originalRowCount: existing?.originalRowCount ?? 0,
      deletedRowCount,
      warnings: existing?.warnings ?? [],
      error: "",
      startedAt: "",
      finishedAt: "",
      updatedAt: createdAt
    };

    if (existing && !shouldRestoreDeletedRows && !shouldRetryError) {
      store = await markDuplicateDocument(existing.id);
      const updatedDocument: InvoiceDocument = store.documents.find((document) => document.id === existing.id) ?? existing;
      jobFiles.push({
        ...baseFile,
        status: "duplicate",
        localPath: "",
        rowCount: updatedDocument.rowCount,
        originalRowCount: updatedDocument.originalRowCount,
        deletedRowCount: updatedDocument.deletedRowCount,
        duplicate: true,
        skipped: true,
        restored: false,
        retried: false,
        warnings: updatedDocument.warnings,
        finishedAt: createdAt
      });
      continue;
    }

    const localPath = path.join(jobUploadDir, `${documentId}${extensionFor(fileName)}`);
    await fs.writeFile(localPath, buffer);
    jobFiles.push({
      ...baseFile,
      status: shouldRetryError ? "retry" : shouldRestoreDeletedRows ? "restore" : "queued",
      localPath,
      duplicate: false,
      skipped: false,
      restored: shouldRestoreDeletedRows,
      retried: shouldRetryError
    });
  }

  const job: ScanJobRecord = {
    id,
    status: "queued",
    createdAt,
    startedAt: "",
    finishedAt: "",
    updatedAt: createdAt,
    fileCount: jobFiles.length,
    message: "Đã tạo job scan.",
    error: "",
    files: jobFiles
  };

  await saveInitialJob(job);
  void processScanJob(id);
  return job;
}
