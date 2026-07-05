import { NextResponse } from "next/server";
import { isDatabaseConfigured, getPool } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";
import { cleanInvoiceProductName } from "@/lib/shared/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ScanRowDecisionHint {
  rowId: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  /** Mặc định "new" nếu không có match, "add_stock" nếu có duy nhất 1 match */
  defaultAction: "add_stock" | "new";
  matchedProducts: Array<{ id: string; sku: string; name: string; stock: number; unit: string }>;
  /** Match hiện tại (id) nếu có 1 match, hoặc matched từ synced_product_id */
  defaultProductId: string | null;
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const s = String(value).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function routeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: "Database chưa cấu hình." }, { status: 500 });
  }
  try {
    const url = new URL(request.url);
    const documentId = url.searchParams.get("documentId")?.trim();
    if (!documentId) {
      return NextResponse.json({ error: "Thiếu documentId." }, { status: 400 });
    }
    await ensureDatabase();
    const pool = getPool();

    const docRes = await pool.query(
      `select id, file_name, status
         from invoice_documents
        where id = $1
        limit 1`,
      [documentId]
    );
    if (docRes.rows.length === 0) {
      return NextResponse.json({ error: "Không tìm thấy tài liệu." }, { status: 404 });
    }
    const document = docRes.rows[0];

    const rowsRes = await pool.query(
      `select r.id, r.document_id, r.supplier_name,
              r.internal_product_code as sku,
              coalesce(nullif(r.adjusted_invoice_name,''), nullif(r.input_product_name,''), r.retail_name) as raw_product_name,
              r.unit,
              coalesce(nullif(r.inventory_added_quantity,''), r.quantity) as quantity_text,
              coalesce(nullif(r.unit_price_after_tax,''), r.unit_price) as unit_cost_text,
              r.synced_product_id
         from invoice_rows r
        where r.document_id = $1
        order by r.created_at asc`,
      [documentId]
    );

    // Supplier name = first non-empty supplier_name from rows
    const supplierFromDoc = (() => {
      for (const r of rowsRes.rows) {
        const sn = String(r.supplier_name ?? "").trim();
        if (sn) return sn;
      }
      return "";
    })();

    // Gather SKUs to look up products
    const skuList = Array.from(
      new Set(
        rowsRes.rows
          .map((r: any) => String(r.sku ?? "").trim())
          .filter((s: string) => s.length > 0)
      )
    );

    // Also gather normalized product names so we can fuzzy-match rows that
    // have no SKU. Helps the scan modal pre-populate "Cộng tồn" suggestions
    // instead of defaulting to "Tạo sản phẩm mới".
    const nameList = Array.from(
      new Set(
        rowsRes.rows
          .map((r: any) =>
            cleanInvoiceProductName(
              String(r.raw_product_name ?? "").trim()
            )
          )
          .filter((s: string) => s.length > 0)
      )
    );

    let productsBySku = new Map<string, Array<{ id: string; sku: string; name: string; stock: number; unit: string }>>();
    if (skuList.length > 0) {
      const prodRes = await pool.query(
        `select p.id, p.sku, p.name, p.unit, coalesce(p.stock, 0) as stock
           from products p
          where p.sku = any($1::text[])`,
        [skuList]
      );
      for (const p of prodRes.rows) {
        const sku = String(p.sku);
        const arr = productsBySku.get(sku) ?? [];
        arr.push({
          id: String(p.id),
          sku,
          name: String(p.name ?? ""),
          stock: Number(p.stock ?? 0),
          unit: String(p.unit ?? "")
        });
        productsBySku.set(sku, arr);
      }
    }

    // Fuzzy name match using ILIKE %name%. We pull the top candidates per row
    // (limited via row count). Since rows typically < 50 we can fetch a single
    // candidate per row independently to keep the API fast and predictable.
    const candidatesByName = new Map<string, Array<{ id: string; sku: string; name: string; stock: number; unit: string }>>();
    for (const rowName of nameList) {
      const prodRes = await pool.query(
        `select id, sku, name, unit, coalesce(stock, 0) as stock
           from products
          where name ilike $1
          order by name asc
          limit 5`,
        [`%${rowName}%`]
      );
      if (prodRes.rows.length === 0) continue;
      candidatesByName.set(
        rowName,
        prodRes.rows.map((p: any) => ({
          id: String(p.id),
          sku: String(p.sku ?? ""),
          name: String(p.name ?? ""),
          stock: Number(p.stock ?? 0),
          unit: String(p.unit ?? "")
        }))
      );
    }

    const decisions: ScanRowDecisionHint[] = rowsRes.rows.map((r: any) => {
      const sku = String(r.sku ?? "").trim();
      const rawName = String(r.raw_product_name ?? sku ?? "").trim();
      const productName = cleanInvoiceProductName(rawName);
      const unit = String(r.unit ?? "").trim();
      const quantity = parseNumber(r.quantity_text);
      const unitCost = parseNumber(r.unit_cost_text);

      // 1) Strict SKU candidates first.
      const skuMatches = sku ? productsBySku.get(sku) ?? [] : [];
      // 2) Then name-candidates from fuzzy match (when SKU didn't match strictly).
      // De-dupe by id, SKU candidates take priority.
      const nameCandidates = productName
        ? candidatesByName.get(productName) ?? []
        : [];
      const seen = new Set<string>();
      const matched: Array<{ id: string; sku: string; name: string; stock: number; unit: string }> = [];
      for (const p of skuMatches) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        matched.push(p);
      }
      for (const p of nameCandidates) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        matched.push(p);
      }

      const syncedProductId = r.synced_product_id ? String(r.synced_product_id) : null;
      const onlyMatch = matched.length === 1 ? matched[0].id : null;
      const defaultProductId = onlyMatch ?? (syncedProductId && matched.some((m) => m.id === syncedProductId) ? syncedProductId : null);

      const isValid = quantity > 0 && productName.length > 0;
      const defaultAction = isValid
        ? matched.length > 0
          ? "add_stock"
          : "new"
        : "new"; // invalid rows will be skipped in UI

      return {
        rowId: String(r.id),
        sku,
        productName,
        unit,
        quantity,
        unitCost,
        defaultAction,
        matchedProducts: matched,
        defaultProductId
      };
    });

    return NextResponse.json({
      documentId: String(document.id),
      fileName: String(document.file_name ?? ""),
      status: String(document.status ?? ""),
      supplierName: supplierFromDoc,
      decisions,
      validCount: decisions.filter((d) => d.quantity > 0 && d.productName.length > 0).length,
      skippedCount: decisions.filter((d) => !(d.quantity > 0 && d.productName.length > 0)).length
    });
  } catch (error) {
    console.error("GET /api/inventory/receipts/check-document failed:", error);
    return NextResponse.json({ error: routeError(error) }, { status: 500 });
  }
}