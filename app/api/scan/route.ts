import { NextResponse } from "next/server";
import { getUploadedFileId, scanUploadedFile } from "@/lib/ocr";
import { readStore, upsertDocumentWithRows } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
    if (existing) {
      results.push({ document: existing, skipped: true });
      continue;
    }

    const result = await scanUploadedFile(file);
    store = await upsertDocumentWithRows(result.document, result.rows);
    results.push(result);
  }

  return NextResponse.json({ ...store, results });
}
