import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function str(v: unknown, f = ""): string {
  if (v == null) return f;
  return String(v).trim();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("date_from") ?? "";
    const dateTo = url.searchParams.get("date_to") ?? "";
    const supplierId = url.searchParams.get("supplier_id") ?? "";
    const productId = url.searchParams.get("product_id") ?? "";
    const branch = url.searchParams.get("branch") ?? "";
    const groupBy = url.searchParams.get("group_by") ?? "time"; // time | supplier | product | order | payment_time | payment_staff | payment_method | payment_branch

    if (!isDatabaseConfigured) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    await ensureDatabase();
    const pool = getPool();

    // ── Group: by time ────────────────────────────────────────────────────────
    if (groupBy === "time") {
      const where: string[] = [];
      const params: (string | number)[] = [];
      let p = 1;
      if (dateFrom) { where.push(`gr.received_at >= $${p++}`); params.push(dateFrom); }
      if (dateTo) { where.push(`gr.received_at <= $${p++}::date + interval '1 day'`); params.push(dateTo); }
      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const result = await pool.query(`
        select
          date_trunc('day', gr.received_at)::date as day,
          count(distinct gr.id) as receipt_count,
          coalesce(sum(gri.received_qty * gri.unit_cost), 0)::numeric as total_amount
        from goods_receipts gr
        left join goods_receipt_items gri on gri.goods_receipt_id = gr.id
        ${whereSQL}
        group by day
        order by day asc
        limit 90
      `, params);

      return NextResponse.json({ daily: result.rows.map((r) => ({ day: r.day, receipt_count: num(r.receipt_count), total_amount: num(r.total_amount) })) });
    }

    // ── Group: by supplier ───────────────────────────────────────────────────
    if (groupBy === "supplier") {
      const where: string[] = [];
      const params: (string | number)[] = [];
      let p = 1;
      if (dateFrom) { where.push(`gr.received_at >= $${p++}`); params.push(dateFrom); }
      if (dateTo) { where.push(`gr.received_at <= $${p++}::date + interval '1 day'`); params.push(dateTo); }
      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const result = await pool.query(`
        select
          coalesce(gr.supplier_name, 'Không xác định') as supplier_name,
          count(distinct gr.id) as receipt_count,
          coalesce(sum(gri.received_qty * gri.unit_cost), 0)::numeric as total_amount,
          coalesce(sum(gr.paid), 0)::numeric as total_paid
        from goods_receipts gr
        left join goods_receipt_items gri on gri.goods_receipt_id = gr.id
        ${whereSQL}
        group by gr.supplier_name
        order by total_amount desc
        limit 50
      `, params);

      return NextResponse.json({ suppliers: result.rows.map((r) => ({
        supplier_name: str(r.supplier_name),
        receipt_count: num(r.receipt_count),
        total_amount: num(r.total_amount),
        total_paid: num(r.total_paid),
        unpaid: num(r.total_amount) - num(r.total_paid),
      })) });
    }

    // ── Group: by product ───────────────────────────────────────────────────
    if (groupBy === "product") {
      const where: string[] = [];
      const params: (string | number)[] = [];
      let p = 1;
      if (dateFrom) { where.push(`gr.received_at >= $${p++}`); params.push(dateFrom); }
      if (dateTo) { where.push(`gr.received_at <= $${p++}::date + interval '1 day'`); params.push(dateTo); }
      if (productId) { where.push(`gri.product_id = $${p++}`); params.push(productId); }
      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const result = await pool.query(`
        select
          gri.sku,
          gri.product_name,
          sum(gri.received_qty)::numeric as total_qty,
          avg(gri.unit_cost)::numeric as avg_price,
          sum(gri.received_qty * gri.unit_cost)::numeric as total_amount
        from goods_receipt_items gri
        join goods_receipts gr on gr.id = gri.goods_receipt_id
        ${whereSQL}
        group by gri.sku, gri.product_name
        order by total_qty desc
        limit 100
      `, params);

      return NextResponse.json({ products: result.rows.map((r) => ({
        sku: str(r.sku),
        product_name: str(r.product_name),
        total_qty: num(r.total_qty),
        avg_price: num(r.avg_price),
        total_amount: num(r.total_amount),
      })) });
    }

    // ── Group: by order ──────────────────────────────────────────────────────
    if (groupBy === "order") {
      const where: string[] = [];
      const params: (string | number)[] = [];
      let p = 1;
      if (dateFrom) { where.push(`gr.received_at >= $${p++}`); params.push(dateFrom); }
      if (dateTo) { where.push(`gr.received_at <= $${p++}::date + interval '1 day'`); params.push(dateTo); }
      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const result = await pool.query(`
        select
          gr.id,
          gr.code,
          gr.supplier_name,
          gr.staff,
          gr.received_at,
          gr.receipt_status,
          gr.total_cost,
          gr.paid,
          (gr.total_cost - coalesce(gr.paid, 0))::numeric as unpaid,
          count(gri.id)::int as item_count
        from goods_receipts gr
        left join goods_receipt_items gri on gri.goods_receipt_id = gr.id
        ${whereSQL}
        group by gr.id
        order by gr.received_at desc
        limit 100
      `, params);

      return NextResponse.json({ orders: result.rows.map((r) => ({
        id: str(r.id),
        code: str(r.code),
        supplier_name: str(r.supplier_name),
        staff: str(r.staff),
        received_at: r.received_at,
        receipt_status: str(r.receipt_status),
        total: num(r.total_cost),
        paid: num(r.paid),
        unpaid: num(r.unpaid),
        item_count: num(r.item_count),
      })) });
    }

    // ── Group: payment by time ───────────────────────────────────────────────
    if (groupBy === "payment_time") {
      const where: string[] = [];
      const params: (string | number)[] = [];
      let p = 1;
      if (dateFrom) { where.push(`gr.received_at >= $${p++}`); params.push(dateFrom); }
      if (dateTo) { where.push(`gr.received_at <= $${p++}::date + interval '1 day'`); params.push(dateTo); }
      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const result = await pool.query(`
        select
          date_trunc('day', gr.received_at)::date as day,
          sum(gr.paid) FILTER (where gr.paid > 0)::numeric as total_paid,
          sum(gr.total_cost - coalesce(gr.paid, 0)) FILTER (where gr.total_cost - coalesce(gr.paid, 0) > 0)::numeric as total_unpaid
        from goods_receipts gr
        ${whereSQL}
        group by day
        order by day asc
        limit 90
      `, params);

      return NextResponse.json({ daily: result.rows.map((r) => ({
        day: r.day,
        total_paid: num(r.total_paid),
        total_unpaid: num(r.total_unpaid),
      })) });
    }

    // ── Group: payment by method ────────────────────────────────────────────
    if (groupBy === "payment_method") {
      const where: string[] = [];
      const params: (string | number)[] = [];
      let p = 1;
      if (dateFrom) { where.push(`gr.received_at >= $${p++}`); params.push(dateFrom); }
      if (dateTo) { where.push(`gr.received_at <= $${p++}::date + interval '1 day'`); params.push(dateTo); }
      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const result = await pool.query(`
        select
          coalesce(gr.payment_method, 'cash') as method,
          count(gr.id) as payment_count,
          sum(gr.paid)::numeric as total_paid
        from goods_receipts gr
        ${whereSQL} AND gr.paid > 0
        group by gr.payment_method
        order by total_paid desc
      `, params);

      return NextResponse.json({ methods: result.rows.map((r) => ({
        method: str(r.method),
        payment_count: num(r.payment_count),
        total_paid: num(r.total_paid),
      })) });
    }

    // ── Group: payment by branch ─────────────────────────────────────────────
    if (groupBy === "payment_branch") {
      const where: string[] = [];
      const params: (string | number)[] = [];
      let p = 1;
      if (dateFrom) { where.push(`gr.received_at >= $${p++}`); params.push(dateFrom); }
      if (dateTo) { where.push(`gr.received_at <= $${p++}::date + interval '1 day'`); params.push(dateTo); }
      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const result = await pool.query(`
        select
          gr.branch,
          count(distinct gr.id) as receipt_count,
          sum(gr.total_cost)::numeric as total_amount,
          sum(gr.paid)::numeric as total_paid
        from goods_receipts gr
        ${whereSQL}
        group by gr.branch
        order by total_amount desc
      `, params);

      return NextResponse.json({ branches: result.rows.map((r) => ({
        branch: str(r.branch),
        receipt_count: num(r.receipt_count),
        total_amount: num(r.total_amount),
        total_paid: num(r.total_paid),
        unpaid: num(r.total_amount) - num(r.total_paid),
      })) });
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    const where: string[] = [];
    const params: (string | number)[] = [];
    let p = 1;
    if (dateFrom) { where.push(`gr.received_at >= $${p++}`); params.push(dateFrom); }
    if (dateTo) { where.push(`gr.received_at <= $${p++}::date + interval '1 day'`); params.push(dateTo); }
    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const summary = await pool.query(`
      select
        count(distinct gr.id) as total_receipts,
        sum(gri.received_qty)::numeric as total_quantity,
        sum(gri.received_qty * gri.unit_cost)::numeric as total_amount,
        sum(gr.paid)::numeric as total_paid,
        (sum(gri.received_qty * gri.unit_cost) - sum(gr.paid))::numeric as total_unpaid
      from goods_receipts gr
      left join goods_receipt_items gri on gri.goods_receipt_id = gr.id
      ${whereSQL}
    `, params);

    const s = summary.rows[0];
    return NextResponse.json({
      total_receipts: num(s.total_receipts),
      total_quantity: num(s.total_quantity),
      total_amount: num(s.total_amount),
      total_paid: num(s.total_paid),
      total_unpaid: num(s.total_unpaid),
    });
  } catch (error) {
    console.error("GET /api/reports/purchases failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lỗi server" }, { status: 500 });
  }
}
