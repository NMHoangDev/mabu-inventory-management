import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";
import { createProduct, updateProduct } from "@/lib/products/repository";
import { loadWorkbookSheet, rowsToObjects } from "@/lib/imports/xlsx-helpers";
import { PRODUCT_IMPORT_HEADER_MAP } from "@/lib/products/import-fields";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ParsedRow {
  rowNumber: number;
  sku: string;
  name: string;
  barcode: string;
  unit: string;
  description: string;
  price: string;
  compare_at_price: string;
  cost_price: string;
  brand_name: string;
  product_type_name: string;
  status: string;
  action?: "create" | "update";
  errors: string[];
}

function parseMoney(text: string): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[^\d.-]/g, "");
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

async function parseFile(buffer: Buffer): Promise<{ rows: ParsedRow[]; skus: string[] }> {
  const sheet = await loadWorkbookSheet(buffer);
  const raw = rowsToObjects(sheet, PRODUCT_IMPORT_HEADER_MAP);
  const rows: ParsedRow[] = [];
  const skus: string[] = [];

  for (const { rowNumber, values } of raw) {
    const errors: string[] = [];
    const sku = (values.sku ?? "").trim();
    const name = (values.name ?? "").trim();
    if (!sku) errors.push("Thiếu SKU.");

    const priceNum = parseMoney(values.price ?? "");
    const compareNum = parseMoney(values.compare_at_price ?? "");
    const costNum = parseMoney(values.cost_price ?? "");
    if (Number.isNaN(priceNum) || (priceNum !== undefined && priceNum < 0)) errors.push("Giá bán không hợp lệ.");
    if (Number.isNaN(compareNum) || (compareNum !== undefined && compareNum < 0)) errors.push("Giá so sánh không hợp lệ.");
    if (Number.isNaN(costNum) || (costNum !== undefined && costNum < 0)) errors.push("Giá vốn không hợp lệ.");

    if (sku) skus.push(sku);

    rows.push({
      rowNumber,
      sku,
      name,
      barcode: values.barcode ?? "",
      unit: values.unit ?? "",
      description: values.description ?? "",
      price: values.price ?? "",
      compare_at_price: values.compare_at_price ?? "",
      cost_price: values.cost_price ?? "",
      brand_name: values.brand_name ?? "",
      product_type_name: values.product_type_name ?? "",
      status: values.status ?? "",
      errors
    });
  }
  return { rows, skus };
}

async function classifyRows(rows: ParsedRow[], skus: string[]) {
  if (!isDatabaseConfigured) return new Map<string, string>();
  await ensureDatabase();
  const pool = getPool();
  const existing = skus.length
    ? await pool.query(`select id, sku from products where lower(sku) = any($1::text[])`, [skus.map((s) => s.toLowerCase())])
    : { rows: [] as any[] };
  const existingBySkuLower = new Map<string, string>();
  for (const r of existing.rows) existingBySkuLower.set(String(r.sku).toLowerCase(), r.id);

  for (const row of rows) {
    if (row.errors.length > 0 || !row.sku) continue;
    const existingId = existingBySkuLower.get(row.sku.toLowerCase());
    if (existingId) {
      row.action = "update";
    } else {
      row.action = "create";
      if (!row.name) row.errors.push("Thiếu tên sản phẩm (bắt buộc khi tạo SKU mới).");
    }
  }
  return existingBySkuLower;
}

export async function POST(request: Request) {
  const guard = await requirePermission("products.import");
  if (guard) return guard;
  try {
    const form = await request.formData();
    const mode = String(form.get("mode") ?? "parse");
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, skus } = await parseFile(buffer);
    await classifyRows(rows, skus);

    if (mode === "parse") {
      const toCreate = rows.filter((r) => r.action === "create" && r.errors.length === 0).length;
      const toUpdate = rows.filter((r) => r.action === "update" && r.errors.length === 0).length;
      const errorCount = rows.filter((r) => r.errors.length > 0).length;
      return NextResponse.json({
        rows: rows.map((r) => ({
          rowNumber: r.rowNumber,
          sku: r.sku,
          name: r.name,
          action: r.errors.length > 0 ? "error" : r.action,
          errors: r.errors.length > 0 ? r.errors : undefined
        })),
        summary: { toCreate, toUpdate, errorCount, totalRows: rows.length }
      });
    }

    if (mode === "commit") {
      let created = 0;
      let updated = 0;
      const errors: { rowNumber: number; message: string }[] = [];
      for (const row of rows) {
        if (row.errors.length > 0) {
          errors.push({ rowNumber: row.rowNumber, message: row.errors.join("; ") });
          continue;
        }
        try {
          const input = {
            name: row.name || undefined,
            sku: row.sku,
            barcode: row.barcode || undefined,
            unit: row.unit || undefined,
            description: row.description || undefined,
            price: parseMoney(row.price),
            compare_at_price: parseMoney(row.compare_at_price),
            cost_price: parseMoney(row.cost_price),
            brand_name: row.brand_name || undefined,
            product_type_name: row.product_type_name || undefined,
            status: row.status ? row.status.toLowerCase() : undefined
          };
          if (row.action === "update") {
            const pool = getPool();
            const existingRes = await pool.query(`select id from products where lower(sku) = lower($1) limit 1`, [row.sku]);
            const existingId = existingRes.rows[0]?.id;
            if (!existingId) {
              errors.push({ rowNumber: row.rowNumber, message: `SKU ${row.sku} không còn tồn tại để cập nhật.` });
              continue;
            }
            await updateProduct(existingId, { ...input, name: input.name ?? row.name } as any);
            updated++;
          } else {
            if (!input.name) {
              errors.push({ rowNumber: row.rowNumber, message: "Thiếu tên sản phẩm." });
              continue;
            }
            await createProduct(input as any);
            created++;
          }
        } catch (err) {
          errors.push({
            rowNumber: row.rowNumber,
            message: err instanceof Error ? err.message : "Lỗi không xác định."
          });
        }
      }
      return NextResponse.json({ created, updated, errors });
    }

    return NextResponse.json({ error: "mode không hợp lệ." }, { status: 400 });
  } catch (error) {
    console.error("Products import API failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không nhập được dữ liệu." },
      { status: 500 }
    );
  }
}
