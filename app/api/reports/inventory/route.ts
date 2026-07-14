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
      // Tồn kho thật ở products.stock (inventory_levels/product_variants không dùng).
      const result = await pool.query(`
        select
          count(*) as total_products,
          coalesce(sum(p.stock), 0)::numeric as total_stock,
          coalesce(sum(p.stock * coalesce(p.cost_price, 0)), 0)::numeric as total_value
        from products p
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
          'Chi nhánh mặc định' as branch,
          coalesce(p.stock, 0)::numeric as available_quantity,
          0::numeric as reserved_quantity,
          coalesce(p.cost_price, 0)::numeric as cost_price,
          p.status
        from products p
        left join categories c on c.id = p.category_id
        order by p.stock asc
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
      // Nửa "xuất kho" của UNION dùng bảng orders (không có gr) — phải lọc theo
      // o.created_at với CÙNG placeholder $1/$2, không tái dùng điều kiện gr.*.
      const orderWhere: string[] = [];
      let op = 1;
      if (dateFrom) { orderWhere.push(`o.created_at >= $${op++}`); }
      if (dateTo) { orderWhere.push(`o.created_at <= $${op++}::date + interval '1 day'`); }
      const orderWhereSQL = orderWhere.length ? `AND ${orderWhere.join(" AND ")}` : "";

      // Build combined ledger from goods receipts (imports) and orders (exports)
      const ledger = await pool.query(`
        select
          gr.received_at as movement_date,
          gr.code as reference,
          coalesce(gri.product_name, '—') as product_name,
          coalesce(gri.sku, '') as sku,
          coalesce(gr.branch, 'Chi nhánh mặc định') as branch,
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
          coalesce(oi.product_sku, '') as sku,
          coalesce(o.branch, 'Chi nhánh mặc định') as branch,
          o.staff,
          'Xuất kho' as movement_type,
          0::numeric as quantity_in,
          oi.quantity::numeric as quantity_out,
          oi.quantity * oi.unit_price as amount
        from orders o
        join order_items oi on oi.order_id = o.id
        where o.status != 'cancelled'
        ${orderWhereSQL}
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
      // Định mức tối thiểu = products.reorder_point nếu đã cấu hình (>0), nếu chưa
      // thì mặc định 10. Tồn kho thật lấy từ products.stock.
      const result = await pool.query(`
        select
          p.id,
          p.name as product_name,
          coalesce(p.sku, '') as sku,
          coalesce(c.name, '') as category_name,
          'Chi nhánh mặc định' as branch,
          coalesce(p.stock, 0)::numeric as current_qty,
          coalesce(nullif(p.reorder_point, 0), 10)::numeric as min_stock,
          (coalesce(nullif(p.reorder_point, 0), 10) - coalesce(p.stock, 0))::numeric as shortage
        from products p
        left join categories c on c.id = p.category_id
        where (p.status = 'active' or p.status is null)
          and coalesce(p.stock, 0) < coalesce(nullif(p.reorder_point, 0), 10)
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
      // Không có cột định mức tối đa theo sản phẩm → dùng ngưỡng mặc định 200.
      // Tồn kho thật lấy từ products.stock, giá vốn từ products.cost_price.
      const MAX_STOCK_DEFAULT = 200;
      const result = await pool.query(`
        select
          p.id,
          p.name as product_name,
          coalesce(p.sku, '') as sku,
          coalesce(c.name, '') as category_name,
          'Chi nhánh mặc định' as branch,
          coalesce(p.stock, 0)::numeric as current_qty,
          ${MAX_STOCK_DEFAULT}::numeric as max_stock,
          (coalesce(p.stock, 0) - ${MAX_STOCK_DEFAULT})::numeric as excess,
          coalesce(p.cost_price, 0)::numeric as cost_price
        from products p
        left join categories c on c.id = p.category_id
        where (p.status = 'active' or p.status is null)
          and coalesce(p.stock, 0) > ${MAX_STOCK_DEFAULT}
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

      // Xuất kho thật (trước đây LUÔN = 0, hardcoded ở services/reportService.ts)
      // — tính từ order_items đã thực sự trừ tồn (stock_deducted_at is not null).
      const exportWhere: string[] = [];
      const exportParams: (string | number)[] = [];
      let ep = 1;
      if (dateFrom) { exportWhere.push(`o.created_at >= $${ep++}`); exportParams.push(dateFrom); }
      if (dateTo) { exportWhere.push(`o.created_at <= $${ep++}::date + interval '1 day'`); exportParams.push(dateTo); }
      const exportWhereSQL = exportWhere.length ? `where ${exportWhere.join(" and ")} and oi.stock_deducted_at is not null` : `where oi.stock_deducted_at is not null`;
      const exportRes = await pool.query(
        `select coalesce(sum(oi.quantity), 0)::numeric as export_qty
           from order_items oi
           join orders o on o.id = oi.order_id
           ${exportWhereSQL}`,
        exportParams
      );
      const totalExport = num(exportRes.rows[0]?.export_qty);
      const totalImport = result.rows.reduce((s, r) => s + num(r.import_qty), 0);

      // Xuất theo từng SKU — trước đây bảng "Chi tiết xuất nhập tồn" luôn hiện
      // NaN ở cột "Xuất trong kỳ" vì items chỉ có import_qty, chưa từng có
      // export_qty nào được gán (kể cả ở nhánh "dữ liệu thật").
      const exportBySkuRes = await pool.query(
        `select oi.product_sku as sku, coalesce(sum(oi.quantity), 0)::numeric as export_qty
           from order_items oi
           join orders o on o.id = oi.order_id
           ${exportWhereSQL}
           group by oi.product_sku`,
        exportParams
      );
      const exportBySku = new Map(exportBySkuRes.rows.map((r) => [str(r.sku), num(r.export_qty)]));

      // Nhập/xuất theo ngày — trước đây trang FE tự sinh random, giờ tính thật.
      const dailyImportRes = await pool.query(
        `select to_char(gr.received_at, 'YYYY-MM-DD') as day, coalesce(sum(gri.received_qty), 0)::numeric as qty
           from goods_receipt_items gri
           join goods_receipts gr on gr.id = gri.goods_receipt_id
           ${whereSQL}
           group by 1`,
        params
      );
      const dailyExportRes = await pool.query(
        `select to_char(o.created_at, 'YYYY-MM-DD') as day, coalesce(sum(oi.quantity), 0)::numeric as qty
           from order_items oi
           join orders o on o.id = oi.order_id
           ${exportWhereSQL}
           group by 1`,
        exportParams
      );
      const importByDay = new Map(dailyImportRes.rows.map((r) => [r.day, num(r.qty)]));
      const exportByDay = new Map(dailyExportRes.rows.map((r) => [r.day, num(r.qty)]));
      const daily: { day: string; import: number; export: number }[] = [];
      if (dateFrom && dateTo) {
        const d0 = new Date(dateFrom);
        const d1 = new Date(dateTo);
        for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
          const key = new Date(d).toISOString().slice(0, 10);
          daily.push({ day: key, import: importByDay.get(key) ?? 0, export: exportByDay.get(key) ?? 0 });
        }
      }

      // Tồn cuối kỳ = tồn hiện tại thật (snapshot). Tồn đầu kỳ suy ra ngược từ
      // tồn cuối trừ đi biến động thật trong kỳ (đầu kỳ = cuối kỳ - nhập + xuất)
      // — không có bảng ledger lịch sử nên đây là suy luận từ số liệu thật,
      // KHÁC với trước đây là hằng số 1000/1000 bất kể input.
      const stockRes = await pool.query(`select coalesce(sum(stock), 0)::numeric as total from products`);
      const totalEnding = num(stockRes.rows[0]?.total);
      const totalBeginning = totalEnding - totalImport + totalExport;

      return NextResponse.json({
        items: result.rows.map((r) => ({
          sku: str(r.sku),
          product_name: str(r.product_name),
          category_name: str(r.category_name),
          import_qty: num(r.import_qty),
          import_value: num(r.import_value),
          export_qty: exportBySku.get(str(r.sku)) ?? 0,
        })),
        daily,
        summary: {
          total_beginning: totalBeginning,
          total_import: totalImport,
          total_export: totalExport,
          total_ending: totalEnding
        }
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
