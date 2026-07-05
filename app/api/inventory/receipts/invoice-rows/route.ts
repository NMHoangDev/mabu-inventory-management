import { NextResponse } from "next/server";
import { z } from "zod";
import { isDatabaseConfigured, getPool } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";
import { cleanInvoiceProductName } from "@/lib/shared/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rowsSchema = z
  .array(
    z.object({
      rowId: z.string().min(1),
      productName: z.string().optional(),
      sku: z.string().optional(),
      unit: z.string().optional(),
      quantity: z.union([z.string(), z.number()]).optional(),
      unitCost: z.union([z.string(), z.number()]).optional()
    })
  )
  .min(1);

const bodySchema = z.object({
  documentId: z.string().min(1),
  rows: rowsSchema
});

function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const s = String(value).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// PATCH /api/inventory/receipts/invoice-rows
// Body: { documentId, rows: [{ rowId, productName?, sku?, unit?, quantity?, unitCost? }] }
// Persists in-modal edits from ScanReceiptOptionsModal so that the subsequent
// confirm-with-options call uses the user-corrected values instead of OCR.
export async function PATCH(request: Request) {
  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: "Database chưa cấu hình." }, { status: 500 });
  }
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { documentId, rows } = parsed.data;
    await ensureDatabase();
    const pool = getPool();

    // Ownership sanity-check: all rows must belong to this document.
    const idsCheck = await pool.query(
      `select id from invoice_rows where document_id = $1::text and id = any($2::text[])`,
      [documentId, rows.map((r) => r.rowId)]
    );
    const validIds = new Set<string>(idsCheck.rows.map((r: any) => String(r.id)));
    if (validIds.size !== rows.length) {
      return NextResponse.json(
        { error: "Có dòng không thuộc hóa đơn này hoặc đã bị xóa." },
        { status: 400 }
      );
    }

    // Apply per-row updates. We split into one query per row to avoid
    // ambiguous binding semantics when fields differ. All updates are
    // independent — a failure in one row only rolls back that row.
    let updated = 0;
    for (const r of rows) {
      const cleanedName = r.productName !== undefined
        ? cleanInvoiceProductName(String(r.productName).trim())
        : undefined;
      const qty = r.quantity !== undefined ? parseNumber(r.quantity) : undefined;
      const cost = r.unitCost !== undefined ? parseNumber(r.unitCost) : undefined;

      const res = await pool.query(
        `update invoice_rows
            set adjusted_invoice_name = coalesce($2, adjusted_invoice_name),
                internal_product_code = coalesce($3, internal_product_code),
                unit = coalesce($4, unit),
                inventory_added_quantity = case when $5::numeric is null then inventory_added_quantity else $5::text end,
                unit_price_after_tax = case when $6::numeric is null then unit_price_after_tax else $6::text end,
                synced_product_id = null, -- reset so confirm re-resolves against new SKU/name
                updated_at = now()
          where id = $1::text and document_id = $7::text`,
        [
          r.rowId,
          cleanedName ?? null,
          r.sku !== undefined ? String(r.sku).trim() || null : null,
          r.unit !== undefined ? String(r.unit).trim() || null : null,
          qty !== undefined ? qty.toString() : null,
          cost !== undefined ? cost.toString() : null,
          documentId
        ]
      );
      if ((res.rowCount ?? 0) > 0) updated += 1;
    }

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("PATCH /api/inventory/receipts/invoice-rows failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lỗi cập nhật dòng hóa đơn." },
      { status: 500 }
    );
  }
}
