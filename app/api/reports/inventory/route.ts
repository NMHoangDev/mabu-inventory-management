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
    const groupBy = url.searchParams.get("group_by") ?? "summary";
    // group_by: summary | detail | ledger | below_threshold | above_threshold | in_out | stock_check

    if (!isDatabaseConfigured) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    await ensureDatabase();
    const pool = getPool();

    // ── Summary ─────────────────────────────────────────────────────────────
    if (groupBy === "summary") {
      const result = await pool.query(`
        select
          count(distinct p.id) as total_products,
          coalesce(sum(il.quantity), 0)::numeric as total_stock,
          coalesce(sum(il.quantity * pv.cost_price), 0)::numeric as total_value
        from products p
        left join product_variants pv on pv.product_id = p.id
        left join inventory_levels il on il.variant_id = pv.id
        where p.status = 'active' or p.status is null
      `);

      const r = result.rows[0];
      return NextResponse.json({
        total_products: num(r.total_products),
        total_stock: num(r.total_stock),
        total_value: num(r.total_value),
      });
    }

    // ── Detail: stock by product with status ─────────────────────────────────
    if (groupBy === "detail") {
      const result = await pool.query(`
        select
          p.id,
          p.name as product_name,
          coalesce(p.sku, '') as sku,
          coalesce(c.name, '') as category_name,
          coalesce(l.name, 'Chi nhánh mặc định') as branch,
          coalesce(sum(il.quantity), 0)::numeric as available_quantity,
          coalesce(sum(il.quantity_on_hold), 0)::numeric as reserved_quantity,
          coalesce(pv.cost_price, 0)::numeric as cost_price,
          p.status
        from products p
        left join product_variants pv on pv.product_id = p.id and pv.position = 1
        left join inventory_levels il on il.variant_id = pv.id
        left join locations l on l.id = il.location_id
        left join categories c on c.id = p.category_id
        group by p.id, p.name, p.sku, c.name, l.name, pv.cost_price, p.status
        order by available_quantity asc
        limit 200
      `);

      return NextResponse.json({
        items: result.rows.map((r) => ({
          id: str(r.id),
          product_name: str(r.product_name),
          sku: str(r.sku),
          category_name: str(r.category_name),
          branch: str(r.branch),
          available_quantity: num(r.available_quantity),
          reserved_quantity: num(r.reserved_quantity),
          cost_price: num(r.cost_price),
          total_value: num(r.available_quantity) * num(r.cost_price),
          status: str(r.status),
        }))
      });
    }

    // ── Ledger: stock movement history ──────────────────────────────────────
    if (groupBy === "ledger") {
      const where: string[] = [];
      const params: (string | number)[] = [];
      let p = 1;
      if (dateFrom) { where.push(`gr.received_at >= $${p++}`); params.push(dateFrom); }
      if (dateTo) { where.push(`gr.received_at <= $${p++}::date + interval '1 day'`); params.push(dateTo); }
      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      // Build combined ledger from goods receipts (imports) and orders (exports)
      const ledger = await pool.query(`
        select
          gr.received_at as movement_date,
          gr.code as reference,
          coalesce(gri.product_name, '—') as product_name,
          coalesce(gri.sku, '') as sku,
          gr.branch,
          gr.staff,
          'Nhập kho' as movement_type,
          gri.received_qty::numeric as quantity_in,
          0::numeric as quantity_out,
          gri.received_qty * gri.unit_cost as amount
        from goods_receipts gr
        join goods_receipt_items gri on gri.goods_receipt_id = gr.id
        ${whereSQL}
        union all
        select
          o.created_at as movement_date,
          o.code as reference,
          coalesce(oi.product_name, '—') as product_name,
          coalesce(oi.sku, '') as sku,
          o.branch,
          o.staff,
          'Xuất kho' as movement_type,
          0::numeric as quantity_in,
          oi.quantity::numeric as quantity_out,
          oi.quantity * oi.unit_price as amount
        from orders o
        join order_items oi on oi.order_id = o.id
        where o.status != 'cancelled'
        ${where.length ? `AND ${where.join(" AND ")}` : ""}
        order by movement_date desc
        limit 200
      `, params);

      return NextResponse.json({
        entries: ledger.rows.map((r) => ({
          date: r.movement_date,
          reference: str(r.reference),
          product_name: str(r.product_name),
          sku: str(r.sku),
          branch: str(r.branch),
          staff: str(r.staff),
          type: str(r.movement_type),
          quantity: num(r.quantity_in) - num(r.quantity_out),
          amount: num(r.amount),
        }))
      });
    }

    // ── Below threshold ───────────────────────────────────────────────────────
    if (groupBy === "below_threshold") {
      const result = await pool.query(`
        select
          p.id,
          p.name as product_name,
          coalesce(p.sku, '') as sku,
          coalesce(c.name, '') as category_name,
          coalesce(l.name, 'Chi nhánh mặc định') as branch,
          coalesce(sum(il.quantity), 0)::numeric as current_qty,
          coalesce(loc.min_stock, 10)::numeric as min_stock,
          (coalesce(loc.min_stock, 10) - coalesce(sum(il.quantity), 0))::numeric as shortage
        from products p
        left join product_variants pv on pv.product_id = p.id and pv.position = 1
        left join inventory_levels il on il.variant_id = pv.id
        left join locations l on l.id = il.location_id
        left join categories c on c.id = p.category_id
        left join location_stock_settings loc on loc.location_id = l.id and loc.product_id = p.id
        group by p.id, p.name, p.sku, c.name, l.name, pv.cost_price, loc.min_stock
        having coalesce(sum(il.quantity), 0) < coalesce(loc.min_stock, 10)
        order by shortage desc
        limit 100
      `);

      return NextResponse.json({
        items: result.rows.map((r) => ({
          id: str(r.id),
          product_name: str(r.product_name),
          sku: str(r.sku),
          category_name: str(r.category_name),
          branch: str(r.branch),
          current_qty: num(r.current_qty),
          min_stock: num(r.min_stock),
          shortage: num(r.shortage),
        }))
      });
    }

    // ── Above threshold ───────────────────────────────────────────────────────
    if (groupBy === "above_threshold") {
      const result = await pool.query(`
        select
          p.id,
          p.name as product_name,
          coalesce(p.sku, '') as sku,
          coalesce(c.name, '') as category_name,
          coalesce(l.name, 'Chi nhánh mặc định') as branch,
          coalesce(sum(il.quantity), 0)::numeric as current_qty,
          coalesce(loc.max_stock, 200)::numeric as max_stock,
          (coalesce(sum(il.quantity), 0) - coalesce(loc.max_stock, 200))::numeric as excess,
          coalesce(pv.cost_price, 0)::numeric as cost_price
        from products p
        left join product_variants pv on pv.product_id = p.id and pv.position = 1
        left join inventory_levels il on il.variant_id = pv.id
        left join locations l on l.id = il.location_id
        left join categories c on c.id = p.category_id
        left join location_stock_settings loc on loc.location_id = l.id and loc.product_id = p.id
        group by p.id, p.name, p.sku, c.name, l.name, pv.cost_price, loc.max_stock
        having coalesce(sum(il.quantity), 0) > coalesce(loc.max_stock, 200)
        order by excess desc
        limit 100
      `);

      return NextResponse.json({
        items: result.rows.map((r) => ({
          id: str(r.id),
          product_name: str(r.product_name),
          sku: str(r.sku),
          category_name: str(r.category_name),
          branch: str(r.branch),
          current_qty: num(r.current_qty),
          max_stock: num(r.max_stock),
          excess: num(r.excess),
          capital_locked: num(r.excess) * num(r.cost_price),
        }))
      });
    }

    // ── In/out balance ────────────────────────────────────────────────────────
    if (groupBy === "in_out") {
      const where: string[] = [];
      const params: (string | number)[] = [];
      let p = 1;
      if (dateFrom) { where.push(`gr.received_at >= $${p++}`); params.push(dateFrom); }
      if (dateTo) { where.push(`gr.received_at <= $${p++}::date + interval '1 day'`); params.push(dateTo); }
      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const result = await pool.query(`
        select
          gri.sku,
          gri.product_name,
          coalesce(c.name, '') as category_name,
          sum(gri.received_qty)::numeric as import_qty,
          sum(gri.received_qty * gri.unit_cost)::numeric as import_value
        from goods_receipt_items gri
        join goods_receipts gr on gr.id = gri.goods_receipt_id
        left join products p on p.sku = gri.sku or p.name = gri.product_name
        left join categories c on c.id = p.category_id
        ${whereSQL}
        group by gri.sku, gri.product_name, c.name
        order by import_qty desc
        limit 50
      `, params);

      return NextResponse.json({
        items: result.rows.map((r) => ({
          sku: str(r.sku),
          product_name: str(r.product_name),
          category_name: str(r.category_name),
          import_qty: num(r.import_qty),
          import_value: num(r.import_value),
        }))
      });
    }

    // ── Stock check ───────────────────────────────────────────────────────────
    if (groupBy === "stock_check") {
      const where: string[] = [];
      const params: (string | number)[] = [];
      let p = 1;
      if (dateFrom) { where.push(`sc.created_at >= $${p++}`); params.push(dateFrom); }
      if (dateTo) { where.push(`sc.created_at <= $${p++}::date + interval '1 day'`); params.push(dateTo); }
      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const result = await pool.query(`
        select
          sc.id,
          sc.code,
          sc.branch,
          sc.staff,
          sc.status,
          sc.total_items,
          sc.variance_items,
          sc.created_at,
          count(sci.id)::int as item_count
        from stock_checks sc
        left join stock_check_items sci on sci.stock_check_id = sc.id
        ${whereSQL}
        group by sc.id
        order by sc.created_at desc
        limit 100
      `, params);

      return NextResponse.json({
        checks: result.rows.map((r) => ({
          id: str(r.id),
          code: str(r.code),
          branch: str(r.branch),
          staff: str(r.staff),
          status: str(r.status),
          total_items: num(r.total_items),
          variance_items: num(r.variance_items),
          created_at: r.created_at,
        }))
      });
    }

    return NextResponse.json({ error: "Unknown group_by" }, { status: 400 });
  } catch (error) {
    console.error("GET /api/reports/inventory failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lỗi server" }, { status: 500 });
  }
}
