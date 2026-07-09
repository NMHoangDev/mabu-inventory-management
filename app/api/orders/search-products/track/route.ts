import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db/migration";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ghi nhớ tần suất 1 sản phẩm được thêm vào đơn hàng — dùng để ưu tiên gợi ý
// trong ô tìm sản phẩm (xem GET /api/orders/search-products, order by
// use_count desc). Gọi fire-and-forget từ orders/new khi addProduct().
export async function POST(request: Request) {
  try {
    if (!isDatabaseConfigured) {
      return NextResponse.json({ ok: true });
    }
    const body = await request.json().catch(() => ({}));
    const productId = typeof body?.product_id === "string" ? body.product_id.trim() : "";
    if (!productId) {
      return NextResponse.json({ error: "product_id is required" }, { status: 400 });
    }
    await ensureDatabase();
    const pool = getPool();
    await pool.query(
      `insert into product_search_usage (product_id, use_count, last_used_at)
       values ($1::uuid, 1, now())
       on conflict (product_id) do update set
         use_count = product_search_usage.use_count + 1,
         last_used_at = now()`,
      [productId]
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Best-effort — không chặn flow tạo đơn hàng nếu tracking lỗi.
    console.warn("POST /api/orders/search-products/track failed:", error);
    return NextResponse.json({ ok: false });
  }
}
