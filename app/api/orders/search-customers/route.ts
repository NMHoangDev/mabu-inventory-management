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
    const like = `%${q}%`;
    const res = await pool.query(
      `select id, code, name, phone, email, group_id
       from customers
       where $1 = '' or name ilike $2 or phone ilike $2 or code ilike $2 or email ilike $2
       order by name asc
       limit $3`,
      [q, like, limit]
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
