import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";
import { parseSapoInventoryReport } from "@/lib/imports/sapo-inventory-report";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MatchedItem {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  system_quantity: number;
  actual_quantity: number;
  system_cost_price: number;
  file_cost_price: number;
}

interface ToCreateRow {
  sku: string;
  product_name: string;
  unit: string;
  actual_quantity: number;
  cost_price: number;
}

interface UnmatchedRow {
  sku: string;
  actual_quantity: number;
}

export async function POST(request: Request) {
  const guard = await requirePermission("stock_checks.create");
  if (guard) return guard;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows } = await parseSapoInventoryReport(buffer);
    if (rows.length === 0) {
      return NextResponse.json({ error: "File không có dòng dữ liệu nào (thiếu Mã SKU)." }, { status: 400 });
    }

    // Dedupe theo SKU (không phân biệt hoa/thường) — dòng sau đè dòng trước
    // nếu file có SKU lặp lại.
    const bySkuLower = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      bySkuLower.set(row.sku.toLowerCase(), row);
    }
    const uniqueRows = Array.from(bySkuLower.values());
    const duplicateCount = rows.length - uniqueRows.length;

    if (!isDatabaseConfigured) {
      return NextResponse.json({ error: "Database chưa được cấu hình (thiếu DATABASE_URL)." }, { status: 500 });
    }
    await ensureDatabase();
    const pool = getPool();

    const skusLower = uniqueRows.map((r) => r.sku.toLowerCase());
    const productsRes = await pool.query(
      `select
         p.id,
         p.sku,
         p.name,
         coalesce(p.unit, '') as unit,
         coalesce(p.stock, 0)::numeric as stock,
         coalesce(p.cost_price, 0)::numeric as cost_price,
         coalesce(img.url, '') as image_url
       from products p
       left join lateral (
         select url from product_images where product_id = p.id order by position asc limit 1
       ) img on true
       where lower(p.sku) = any($1::text[])`,
      [skusLower]
    );

    const productBySkuLower = new Map<
      string,
      { id: string; name: string; unit: string; stock: number; cost_price: number; image_url: string }
    >();
    for (const row of productsRes.rows) {
      productBySkuLower.set(String(row.sku).toLowerCase(), {
        id: row.id,
        name: row.name,
        unit: row.unit,
        stock: Number(row.stock) || 0,
        cost_price: Number(row.cost_price) || 0,
        image_url: row.image_url
      });
    }

    const items: MatchedItem[] = [];
    const toCreate: ToCreateRow[] = [];
    const unmatched: UnmatchedRow[] = [];
    for (const row of uniqueRows) {
      const product = productBySkuLower.get(row.sku.toLowerCase());
      if (product) {
        items.push({
          product_id: product.id,
          sku: row.sku,
          product_name: product.name,
          unit: product.unit,
          image_url: product.image_url,
          system_quantity: product.stock,
          actual_quantity: row.stock,
          system_cost_price: product.cost_price,
          file_cost_price: row.costPrice
        });
        continue;
      }
      // SKU chưa tồn tại trong hệ thống. Nếu file có tên sản phẩm → có thể tự
      // tạo sản phẩm mới (xem /import-excel/create-missing, chỉ chạy khi
      // người dùng thực sự bấm lưu phiếu kiểm — KHÔNG tạo ngay ở bước preview
      // này). Không có tên → không đủ dữ liệu để tạo, để người dùng tự xử lý.
      const name = row.productName || row.variantName;
      if (name) {
        toCreate.push({
          sku: row.sku,
          product_name: name,
          unit: row.unit,
          actual_quantity: row.stock,
          cost_price: row.costPrice
        });
      } else {
        unmatched.push({ sku: row.sku, actual_quantity: row.stock });
      }
    }

    // Chênh lệch giá vốn: chỉ tính khi file CÓ giá vốn thật (>0) và khác giá
    // vốn hệ thống — file trống/0 không được coi là "lệch" (tránh xoá mất
    // giá vốn đã có sẵn chỉ vì dòng đó trong file không ghi giá vốn).
    const costPriceMismatchCount = items.filter(
      (it) => it.file_cost_price > 0 && Math.abs(it.file_cost_price - it.system_cost_price) > 0.01
    ).length;

    return NextResponse.json({
      items,
      toCreate,
      unmatched,
      summary: {
        totalRows: rows.length,
        duplicateInFile: duplicateCount,
        matched: items.length,
        toCreate: toCreate.length,
        unmatched: unmatched.length,
        costPriceMismatch: costPriceMismatchCount
      }
    });
  } catch (error) {
    console.error("Stock check import-excel API failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không đọc được file." },
      { status: 500 }
    );
  }
}
