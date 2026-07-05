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
      return NextResponse.json({ customers: [] });
    }
    await ensureDatabase();
    const pool = getPool();

    // Hỗ trợ search không dấu (vd "nguyen van" khớp "Nguyễn Văn"):
    //   - qRaw dùng cho ILIKE trên các cột gốc (giữ case nhạy khi user gõ đúng dấu)
    //   - qAcc dùng cho unaccent() ILIKE trên cột search_text (đã được trigger fill sẵn)
    // Cột search_text được lowercase + bỏ dấu để ILIKE %x% khớp cả khi user
    // không gõ dấu. Index GIN trigram (migration unaccent) tăng tốc.
    const qRaw = `%${q}%`;
    const qAcc = `%${q
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g, "")}%`;

    const res = await pool.query(
      `select id, code, name, phone, email, group_id
         from customers
        where $1 = ''
           or name ilike $2 or phone ilike $2 or code ilike $2 or email ilike $2
           or (search_text ilike $3)
        order by
          -- Ưu tiên: tên bắt đầu bằng q > tên chứa q > phone/code/email > không dấu
          case
            when lower(name) like lower($4) then 0
            when name ilike $2 then 1
            when phone ilike $2 then 2
            when code ilike $2 then 3
            when email ilike $2 then 4
            else 5
          end,
          length(name) asc,
          name asc
        limit $5`,
      [q, qRaw, qAcc, `${q}%`, limit]
    );
    return NextResponse.json({ customers: res.rows });
  } catch (error) {
    console.error("GET /api/orders/search-customers failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search customers." },
      { status: 500 }
    );
  }
}
