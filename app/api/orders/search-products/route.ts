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
    const like = `%${q}%`;
    const res = await pool.query(
      `select p.id, p.name, p.sku, p.unit, p.price,
              coalesce(pi.url, '') as image_url
       from products p
       left join lateral (
         select url from product_images where product_id = p.id order by position asc limit 1
       ) pi on true
       where p.status = 'active' and ($1 = '' or p.name ilike $2 or p.sku ilike $2 or coalesce(p.barcode,'') ilike $2)
       order by p.name asc
       limit $3`,
      [q, like, limit]
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
