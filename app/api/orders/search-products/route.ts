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
    //   - qSim (không có %) dùng cho similarity() (pg_trgm) — chịu lỗi chính
    //     tả/gõ thiếu chữ mà ILIKE substring không bắt được (vd "kep lo xo"
    //     gõ nhầm "kep lo xoo" hoặc thiếu 1 chữ vẫn ra đúng sản phẩm).
    const qNorm = q
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^\w\sÀ-ɏḀ-ỿ]/g, "");
    const qRaw = `%${q}%`;
    const qAcc = `%${qNorm}%`;

    const res = await pool.query(
      `select p.id, p.name, p.sku, p.unit, p.price, p.cost_price,
              coalesce(p.compare_at_price, 0) as wholesale_price,
              coalesce(pi.url, '') as image_url,
              coalesce(p.stock, 0) as stock,
              coalesce(p.track_inventory, true) as track_inventory,
              coalesce(p.allow_negative_stock, false) as allow_negative_stock,
              coalesce(psu.use_count, 0) as use_count
         from products p
         left join lateral (
           select url from product_images where product_id = p.id order by position asc limit 1
         ) pi on true
         left join product_search_usage psu on psu.product_id = p.id
        where p.status = 'active'
          and (
            $1 = ''
            or p.name ilike $2
            or p.sku ilike $2
            or coalesce(p.barcode,'') ilike $2
            or (p.search_text ilike $3)
            or ($1 <> '' and similarity(coalesce(p.search_text, ''), $6) > 0.25)
          )
        order by
          -- 1) Ưu tiên khớp chính xác/gần đầu chuỗi (SKU/barcode/tên).
          case
            when lower(p.sku) = lower($1) then 0
            when coalesce(p.barcode,'') = $1 then 0
            when lower(p.sku) like lower($4) then 1
            when lower(p.name) like lower($4) then 2
            when p.name ilike $2 then 3
            when p.sku ilike $2 then 4
            else 5
          end,
          -- 2) "Ghi nhớ tìm kiếm": sản phẩm vừa được chọn/thêm vào đơn hàng
          --    gần đây nhất lên trước các sản phẩm cùng hạng khớp — không đè
          --    lên khớp chính xác ở trên, chỉ phân định trong nhóm khớp ngang
          --    nhau. Ưu tiên last_used_at (mới chọn là lên đầu ngay) trước
          --    use_count (trước đây chỉ dùng use_count nên 1 lượt chọn mới
          --    không thắng nổi sản phẩm được chọn nhiều lần trong quá khứ —
          --    trông như tính năng "không hoạt động").
          coalesce(psu.last_used_at, '-infinity'::timestamptz) desc,
          coalesce(psu.use_count, 0) desc,
          -- 3) Gõ sai/thiếu chữ vẫn tìm được nhờ độ tương tự trigram.
          similarity(coalesce(p.search_text, ''), $6) desc,
          length(p.name) asc,
          p.name asc
        limit $5`,
      [q, qRaw, qAcc, `${q}%`, limit, qNorm]
    );
    const products = res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      unit: r.unit,
      price: Number(r.price ?? 0),
      cost_price: Number(r.cost_price ?? 0),
      wholesale_price: Number(r.wholesale_price ?? 0),
      image_url: r.image_url ?? "",
      stock: Number(r.stock ?? 0),
      track_inventory: Boolean(r.track_inventory),
      allow_negative_stock: Boolean(r.allow_negative_stock),
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
