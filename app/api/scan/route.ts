import { NextResponse } from "next/server";
import { getUploadedFileId, scanUploadedFile } from "@/lib/invoices/ocr";
import { markDuplicateDocument, readStore, upsertDocumentWithRows } from "@/lib/invoices/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function routeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
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

      const result = await scanUploadedFile(file);
      store = await upsertDocumentWithRows(result.document, result.rows);
      results.push({ ...result, restored: shouldRestoreDeletedRows, retried: shouldRetryError });
    }

    return NextResponse.json({ ...store, results });
  } catch (error) {
    console.error("Scan API failed:", error);
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
