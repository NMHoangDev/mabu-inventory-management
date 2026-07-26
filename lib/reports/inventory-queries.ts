import type { Pool } from "pg";

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}
function str(v: unknown, f = ""): string {
  if (v == null) return f;
  return String(v).trim();
}

export interface InventorySummary {
  total_products: number;
  total_stock: number;
  total_value: number;
}

export async function queryInventorySummary(pool: Pool): Promise<InventorySummary> {
  const result = await pool.query(`
    select
      count(*) as total_products,
      coalesce(sum(p.stock), 0)::numeric as total_stock,
      coalesce(sum(p.stock * coalesce(p.cost_price, 0)), 0)::numeric as total_value
    from products p
    where p.status = 'active' or p.status is null
  `);
  const r = result.rows[0];
  return { total_products: num(r.total_products), total_stock: num(r.total_stock), total_value: num(r.total_value) };
}

export interface InventoryDetailRow {
  id: string;
  product_name: string;
  sku: string;
  category_name: string;
  branch: string;
  available_quantity: number;
  reserved_quantity: number;
  cost_price: number;
  total_value: number;
  status: string;
}

export async function queryInventoryDetail(pool: Pool, limit = 200): Promise<InventoryDetailRow[]> {
  const result = await pool.query(
    `select
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
     limit $1`,
    [limit]
  );
  return result.rows.map((r) => ({
    id: str(r.id),
    product_name: str(r.product_name),
    sku: str(r.sku),
    category_name: str(r.category_name),
    branch: str(r.branch),
    available_quantity: num(r.available_quantity),
    reserved_quantity: num(r.reserved_quantity),
    cost_price: num(r.cost_price),
    total_value: num(r.available_quantity) * num(r.cost_price),
    status: str(r.status)
  }));
}

export interface InventoryLedgerRow {
  date: string;
  reference: string;
  product_name: string;
  sku: string;
  branch: string;
  staff: string;
  type: string;
  quantity: number;
  amount: number;
}

export async function queryInventoryLedger(
  pool: Pool,
  dateFrom: string,
  dateTo: string,
  limit = 200
): Promise<InventoryLedgerRow[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  let p = 1;
  if (dateFrom) {
    where.push(`gr.received_at >= $${p++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push(`gr.received_at <= $${p++}::date + interval '1 day'`);
    params.push(dateTo);
  }
  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderWhere: string[] = [];
  let op = 1;
  if (dateFrom) orderWhere.push(`o.created_at >= $${op++}`);
  if (dateTo) orderWhere.push(`o.created_at <= $${op++}::date + interval '1 day'`);
  const orderWhereSQL = orderWhere.length ? `AND ${orderWhere.join(" AND ")}` : "";
  const limitParamIdx = params.length + 1;

  const ledger = await pool.query(
    `select
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
     limit $${limitParamIdx}`,
    [...params, limit]
  );

  return ledger.rows.map((r) => ({
    date: r.movement_date,
    reference: str(r.reference),
    product_name: str(r.product_name),
    sku: str(r.sku),
    branch: str(r.branch),
    staff: str(r.staff),
    type: str(r.movement_type),
    quantity: num(r.quantity_in) - num(r.quantity_out),
    amount: num(r.amount)
  }));
}

export interface InventoryBelowThresholdRow {
  id: string;
  product_name: string;
  sku: string;
  category_name: string;
  branch: string;
  current_qty: number;
  min_stock: number;
  shortage: number;
}

export async function queryInventoryBelowThreshold(pool: Pool, limit = 100): Promise<InventoryBelowThresholdRow[]> {
  const result = await pool.query(
    `select
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
     limit $1`,
    [limit]
  );
  return result.rows.map((r) => ({
    id: str(r.id),
    product_name: str(r.product_name),
    sku: str(r.sku),
    category_name: str(r.category_name),
    branch: str(r.branch),
    current_qty: num(r.current_qty),
    min_stock: num(r.min_stock),
    shortage: num(r.shortage)
  }));
}

export interface InventoryAboveThresholdRow {
  id: string;
  product_name: string;
  sku: string;
  category_name: string;
  branch: string;
  current_qty: number;
  max_stock: number;
  excess: number;
  capital_locked: number;
}

const MAX_STOCK_DEFAULT = 200;

export async function queryInventoryAboveThreshold(pool: Pool, limit = 100): Promise<InventoryAboveThresholdRow[]> {
  const result = await pool.query(
    `select
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
     limit $1`,
    [limit]
  );
  return result.rows.map((r) => ({
    id: str(r.id),
    product_name: str(r.product_name),
    sku: str(r.sku),
    category_name: str(r.category_name),
    branch: str(r.branch),
    current_qty: num(r.current_qty),
    max_stock: num(r.max_stock),
    excess: num(r.excess),
    capital_locked: num(r.excess) * num(r.cost_price)
  }));
}

export interface InventoryInOutRow {
  sku: string;
  product_name: string;
  category_name: string;
  import_qty: number;
  import_value: number;
  export_qty: number;
}

export interface InventoryInOutResult {
  items: InventoryInOutRow[];
  daily: { day: string; import: number; export: number }[];
  summary: { total_beginning: number; total_import: number; total_export: number; total_ending: number };
}

export async function queryInventoryInOut(
  pool: Pool,
  dateFrom: string,
  dateTo: string,
  limit = 50
): Promise<InventoryInOutResult> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  let p = 1;
  if (dateFrom) {
    where.push(`gr.received_at >= $${p++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push(`gr.received_at <= $${p++}::date + interval '1 day'`);
    params.push(dateTo);
  }
  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limitParamIdx = params.length + 1;

  const result = await pool.query(
    `select
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
     limit $${limitParamIdx}`,
    [...params, limit]
  );

  const exportWhere: string[] = [];
  const exportParams: (string | number)[] = [];
  let ep = 1;
  if (dateFrom) {
    exportWhere.push(`o.created_at >= $${ep++}`);
    exportParams.push(dateFrom);
  }
  if (dateTo) {
    exportWhere.push(`o.created_at <= $${ep++}::date + interval '1 day'`);
    exportParams.push(dateTo);
  }
  const exportWhereSQL = exportWhere.length
    ? `where ${exportWhere.join(" and ")} and oi.stock_deducted_at is not null`
    : `where oi.stock_deducted_at is not null`;
  const exportRes = await pool.query(
    `select coalesce(sum(oi.quantity), 0)::numeric as export_qty
       from order_items oi
       join orders o on o.id = oi.order_id
       ${exportWhereSQL}`,
    exportParams
  );
  const totalExport = num(exportRes.rows[0]?.export_qty);
  const totalImport = result.rows.reduce((s, r) => s + num(r.import_qty), 0);

  const exportBySkuRes = await pool.query(
    `select oi.product_sku as sku, coalesce(sum(oi.quantity), 0)::numeric as export_qty
       from order_items oi
       join orders o on o.id = oi.order_id
       ${exportWhereSQL}
       group by oi.product_sku`,
    exportParams
  );
  const exportBySku = new Map(exportBySkuRes.rows.map((r) => [str(r.sku), num(r.export_qty)]));

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

  const stockRes = await pool.query(`select coalesce(sum(stock), 0)::numeric as total from products`);
  const totalEnding = num(stockRes.rows[0]?.total);
  const totalBeginning = totalEnding - totalImport + totalExport;

  return {
    items: result.rows.map((r) => ({
      sku: str(r.sku),
      product_name: str(r.product_name),
      category_name: str(r.category_name),
      import_qty: num(r.import_qty),
      import_value: num(r.import_value),
      export_qty: exportBySku.get(str(r.sku)) ?? 0
    })),
    daily,
    summary: {
      total_beginning: totalBeginning,
      total_import: totalImport,
      total_export: totalExport,
      total_ending: totalEnding
    }
  };
}

export interface InventoryStockCheckRow {
  id: string;
  code: string;
  branch: string;
  staff: string;
  status: string;
  total_items: number;
  variance_items: number;
  created_at: string;
}

export async function queryInventoryStockCheck(
  pool: Pool,
  dateFrom: string,
  dateTo: string,
  limit = 100
): Promise<InventoryStockCheckRow[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  let p = 1;
  if (dateFrom) {
    where.push(`sc.created_at >= $${p++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push(`sc.created_at <= $${p++}::date + interval '1 day'`);
    params.push(dateTo);
  }
  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limitParamIdx = params.length + 1;

  const result = await pool.query(
    `select
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
     limit $${limitParamIdx}`,
    [...params, limit]
  );

  return result.rows.map((r) => ({
    id: str(r.id),
    code: str(r.code),
    branch: str(r.branch),
    staff: str(r.staff),
    status: str(r.status),
    total_items: num(r.total_items),
    variance_items: num(r.variance_items),
    created_at: r.created_at
  }));
}
