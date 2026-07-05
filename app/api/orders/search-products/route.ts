import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db/migration";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(20, Number(url.searchParams.get("limit") ?? 10));

    if (!isDatabaseConfigured) {
      return NextResponse.json({ products: [] });
    }
    await ensureDatabase();
    const pool = getPool();

    // Search không dấu (vd "ao thun" khớp "Áo Thun"):
    //   - qRaw ILIKE trên cột gốc (giữ case nhạy khi user gõ đúng dấu)
    //   - qAcc ILIKE trên search_text (lowercase + bỏ dấu, fill bởi trigger)
    const qRaw = `%${q}%`;
    const qAcc = `%${q
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g, "")}%`;

    const res = await pool.query(
      `select p.id, p.name, p.sku, p.unit, p.price,
              coalesce(pi.url, '') as image_url
         from products p
         left join lateral (
           select url from product_images where product_id = p.id order by position asc limit 1
         ) pi on true
        where p.status = 'active'
          and (
            $1 = ''
            or p.name ilike $2
            or p.sku ilike $2
            or coalesce(p.barcode,'') ilike $2
            or (p.search_text ilike $3)
          )
        order by
          -- Ưu tiên: SKU/barcode exact > tên bắt đầu bằng q > tên chứa q > không dấu
          case
            when lower(p.sku) = lower($1) then 0
            when coalesce(p.barcode,'') = $1 then 0
            when lower(p.sku) like lower($4) then 1
            when lower(p.name) like lower($4) then 2
            when p.name ilike $2 then 3
            when p.sku ilike $2 then 4
            else 5
          end,
          length(p.name) asc,
          p.name asc
        limit $5`,
      [q, qRaw, qAcc, `${q}%`, limit]
    );
    const products = res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      unit: r.unit,
      price: Number(r.price ?? 0),
      image_url: r.image_url ?? "",
    }));
    return NextResponse.json({ products });
  } catch (error) {
    console.error("GET /api/orders/search-products failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search products." },
      { status: 500 }
    );
  }
}
