import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db/migration";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Báo cáo công nợ — dùng chung cho /reports/finance/customer-debt (phải thu
// từ khách hàng, dựa trên orders.payment_status) và /reports/finance/supplier-debt
// (phải trả nhà cung cấp, dựa trên goods_receipts.payment_status — cột này
// mới thêm cùng lúc tách thanh toán khỏi tồn kho ở đơn nhập hàng).
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") === "supplier" ? "supplier" : "customer";

    if (!isDatabaseConfigured) {
      return NextResponse.json({ rows: [], total_outstanding: 0 });
    }
    await ensureDatabase();
    const pool = getPool();

    if (type === "supplier") {
      const res = await pool.query(`
        select
          coalesce(gr.supplier_id::text, 'unknown:' || gr.supplier_name) as key,
          gr.supplier_id,
          coalesce(s.name, gr.supplier_name, 'Không rõ NCC') as name,
          coalesce(s.phone, '') as phone,
          count(*) as total_receipts,
          sum(gr.total_cost) as total_amount,
          sum(gr.paid) as total_paid,
          sum(gr.total_cost - gr.paid) as outstanding,
          max(gr.received_at) as last_at
        from goods_receipts gr
        left join suppliers s on s.id = gr.supplier_id
        where gr.payment_status in ('unpaid', 'partial')
          and gr.receipt_status <> 'cancelled'
        group by key, gr.supplier_id, s.name, gr.supplier_name, s.phone
        having sum(gr.total_cost - gr.paid) > 0
        order by outstanding desc
      `);
      const rows = res.rows.map((r) => ({
        id: r.supplier_id,
        name: r.name,
        phone: r.phone,
        total_transactions: Number(r.total_receipts),
        total_amount: Number(r.total_amount),
        total_paid: Number(r.total_paid),
        outstanding: Number(r.outstanding),
        last_at: r.last_at
      }));
      return NextResponse.json({
        rows,
        total_outstanding: rows.reduce((s, r) => s + r.outstanding, 0)
      });
    }

    const res = await pool.query(`
      select
        coalesce(o.customer_id::text, 'unknown:' || o.customer_name) as key,
        o.customer_id,
        coalesce(c.name, o.customer_name, 'Khách lẻ') as name,
        coalesce(c.phone, o.customer_phone, '') as phone,
        count(*) as total_orders,
        sum(o.total) as total_amount,
        sum(o.paid) as total_paid,
        sum(o.total - o.paid) as outstanding,
        max(o.created_at) as last_at
      from orders o
      left join customers c on c.id = o.customer_id
      where o.payment_status in ('unpaid', 'partial')
        and o.status <> 'cancelled'
      group by key, o.customer_id, c.name, o.customer_name, c.phone, o.customer_phone
      having sum(o.total - o.paid) > 0
      order by outstanding desc
    `);
    const rows = res.rows.map((r) => ({
      id: r.customer_id,
      name: r.name,
      phone: r.phone,
      total_transactions: Number(r.total_orders),
      total_amount: Number(r.total_amount),
      total_paid: Number(r.total_paid),
      outstanding: Number(r.outstanding),
      last_at: r.last_at
    }));
    return NextResponse.json({
      rows,
      total_outstanding: rows.reduce((s, r) => s + r.outstanding, 0)
    });
  } catch (error) {
    console.error("GET /api/reports/debt failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được báo cáo công nợ." },
      { status: 500 }
    );
  }
}
