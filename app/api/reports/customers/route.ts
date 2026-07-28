import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db/migration";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Báo cáo khách hàng — trước đây /reports/customers không tồn tại (404) dù
// có trong menu. Tổng hợp thật từ orders + customers, không dữ liệu giả.
export async function GET(request: Request) {
  const guard = await requirePermission("reports.view_customers");
  if (guard) return guard;
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";

    if (!isDatabaseConfigured) {
      return NextResponse.json({
        total_customers: 0,
        new_customers: 0,
        active_customers: 0,
        avg_order_value: 0,
        top_customers: []
      });
    }
    await ensureDatabase();
    const pool = getPool();

    const dateFilter = from && to ? `and o.created_at >= $1::date and o.created_at < ($2::date + interval '1 day')` : "";
    const params = from && to ? [from, to] : [];

    const totalRes = await pool.query(`select count(*)::int as n from customers`);
    const newRes = from && to
      ? await pool.query(
          `select count(*)::int as n from customers where created_at >= $1::date and created_at < ($2::date + interval '1 day')`,
          [from, to]
        )
      : { rows: [{ n: 0 }] };

    const activeRes = await pool.query(
      `select count(distinct o.customer_id)::int as n
         from orders o
        where o.customer_id is not null and o.status <> 'cancelled' ${dateFilter}`,
      params
    );

    const avgRes = await pool.query(
      `select coalesce(avg(o.total), 0)::numeric as v
         from orders o
        where o.status <> 'cancelled' ${dateFilter}`,
      params
    );

    const topRes = await pool.query(
      `select
         o.customer_id,
         coalesce(c.name, o.customer_name, 'Khách lẻ') as name,
         coalesce(c.phone, o.customer_phone, '') as phone,
         count(*)::int as total_orders,
         sum(o.total)::numeric as total_revenue,
         max(o.created_at) as last_order_at
       from orders o
       left join customers c on c.id = o.customer_id
       where o.status <> 'cancelled' ${dateFilter}
       group by o.customer_id, c.name, o.customer_name, c.phone, o.customer_phone
       order by total_revenue desc
       limit 20`,
      params
    );

    return NextResponse.json({
      total_customers: totalRes.rows[0]?.n ?? 0,
      new_customers: newRes.rows[0]?.n ?? 0,
      active_customers: activeRes.rows[0]?.n ?? 0,
      avg_order_value: Number(avgRes.rows[0]?.v ?? 0),
      top_customers: topRes.rows.map((r) => ({
        customer_id: r.customer_id,
        name: r.name,
        phone: r.phone,
        total_orders: Number(r.total_orders),
        total_revenue: Number(r.total_revenue),
        last_order_at: r.last_order_at
      }))
    });
  } catch (error) {
    console.error("GET /api/reports/customers failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được báo cáo khách hàng." },
      { status: 500 }
    );
  }
}
