import { NextResponse } from "next/server";
import { getUploadedFileId, scanUploadedFile } from "@/lib/invoices/ocr";
import { markDuplicateDocument, readStore, upsertDocumentWithRows } from "@/lib/invoices/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_OCR_FILES_PER_SCAN = Number(process.env.MAX_OCR_FILES_PER_SCAN ?? 4);
const OCR_CONCURRENCY = Math.max(1, Number(process.env.OCR_CONCURRENCY ?? 2));

function routeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index]);
      }
    })
  );

  return results;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }

    let store = await readStore();
    const results = [];
    const scanQueue: Array<{ file: File; restored: boolean; retried: boolean }> = [];

    for (const file of files) {
      const id = await getUploadedFileId(file);
      const existing = store.documents.find((document) => document.id === id);
      const activeRowCount = store.rows.filter((row) => row.documentId === id).length;
      const deletedRowCount = existing
        ? Math.max(existing.deletedRowCount ?? 0, (existing.originalRowCount || existing.rowCount || 0) - activeRowCount)
        : 0;
      const shouldRestoreDeletedRows = Boolean(existing && existing.status === "scanned" && deletedRowCount > 0);
      const shouldRetryError = Boolean(existing && existing.status === "error");

      if (existing && !shouldRestoreDeletedRows && !shouldRetryError) {
        store = await markDuplicateDocument(existing.id);
        const updated = store.documents.find((document) => document.id === existing.id) ?? existing;
        results.push({ document: updated, skipped: true, duplicate: true });
        continue;
      }

      scanQueue.push({ file, restored: shouldRestoreDeletedRows, retried: shouldRetryError });
    }

    if (scanQueue.length > MAX_OCR_FILES_PER_SCAN) {
      return NextResponse.json(
        {
          error: `Mỗi lượt chỉ nên OCR tối đa ${MAX_OCR_FILES_PER_SCAN} file mới/lỗi/khôi phục. File trùng vẫn được tự bỏ qua. Hãy chia nhỏ lần scan để Gemini ổn định hơn.`
        },
        { status: 400 }
      );
    }

    const scannedResults = await runWithConcurrency(scanQueue, OCR_CONCURRENCY, async (item) => {
      const result = await scanUploadedFile(item.file);
      return { ...result, restored: item.restored, retried: item.retried };
    });

    for (const result of scannedResults) {
      store = await upsertDocumentWithRows(result.document, result.rows);
      results.push(result);
    }

    return NextResponse.json({ ...store, results });
  } catch (error) {
    console.error("Scan API failed:", error);
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
