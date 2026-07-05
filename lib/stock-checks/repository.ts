import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export type StockCheckStatus = "draft" | "in_progress" | "balanced" | "cancelled";

export interface StockCheckItem {
  id?: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  system_quantity: number;
  actual_quantity: number;
  variance: number;
  variance_reason: string;
  note: string;
  position: number;
}

export interface StockCheck {
  id: string;
  code: string;
  branch: string;
  staff: string;
  note: string;
  tags: string[];
  status: StockCheckStatus;
  total_items: number;
  matched_items: number;
  variance_items: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  items: StockCheckItem[];
}

export interface StockCheckListRow {
  id: string;
  code: string;
  branch: string;
  staff: string;
  status: StockCheckStatus;
  total_items: number;
  matched_items: number;
  variance_items: number;
  created_at: string;
  updated_at: string;
}

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function str(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function rowToListRow(row: any): StockCheckListRow {
  return {
    id: row.id,
    code: str(row.code),
    branch: str(row.branch, "Chi nhánh mặc định"),
    staff: str(row.staff),
    status: row.status,
    total_items: num(row.total_items),
    matched_items: num(row.matched_items),
    variance_items: num(row.variance_items),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function rowToCheck(row: any, items: any[]): StockCheck {
  return {
    id: row.id,
    code: str(row.code),
    branch: str(row.branch, "Chi nhánh mặc định"),
    staff: str(row.staff),
    note: str(row.note),
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status,
    total_items: num(row.total_items),
    matched_items: num(row.matched_items),
    variance_items: num(row.variance_items),
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    items: items.map((it) => ({
      id: it.id,
      product_id: it.product_id,
      sku: str(it.sku),
      product_name: str(it.product_name),
      unit: str(it.unit),
      image_url: str(it.image_url),
      system_quantity: num(it.system_quantity),
      actual_quantity: num(it.actual_quantity),
      variance: num(it.variance),
      variance_reason: str(it.variance_reason),
      note: str(it.note),
      position: num(it.position) || 1
    }))
  };
}

function recomputeStats(items: Array<Pick<StockCheckItem, "system_quantity" | "actual_quantity">>) {
  let total = 0;
  let matched = 0;
  let variance = 0;
  for (const it of items) {
    total += 1;
    const diff = num(it.actual_quantity) - num(it.system_quantity);
    if (Math.abs(diff) < 1e-6) matched += 1;
    else variance += 1;
  }
  return { total, matched, variance };
}

export async function listStockChecks(): Promise<StockCheckListRow[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const result = await pool.query(`
    select id, code, branch, staff, status, total_items, matched_items, variance_items,
           created_at, updated_at
    from stock_checks
    order by created_at desc
  `);
  return result.rows.map(rowToListRow);
}

export async function getStockCheck(id: string): Promise<StockCheck | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const pool = getPool();
  const orderResult = isUuid(id)
    ? await pool.query(`select * from stock_checks where id = $1::uuid limit 1`, [id])
    : await pool.query(`select * from stock_checks where code = $1 limit 1`, [id]);
  if (orderResult.rows.length === 0) return null;
  const itemsResult = await pool.query(
    `select * from stock_check_items where stock_check_id = $1 order by position asc, created_at asc`,
    [orderResult.rows[0].id]
  );
  return rowToCheck(orderResult.rows[0], itemsResult.rows);
}

export async function getNextStockCheckCode(): Promise<string> {
  if (!isDatabaseConfigured) return "KTH00001";
  await ensureDatabase();
  const pool = getPool();
  const result = await pool.query(`
    select code from stock_checks
    where code ~ '^KTH[0-9]+$'
    order by length(code) desc, code desc
    limit 1
  `);
  if (result.rows.length === 0) return "KTH00001";
  const current = String(result.rows[0].code);
  const numPart = parseInt(current.replace(/\D/g, ""), 10);
  if (!Number.isFinite(numPart)) return "KTH00001";
  return `KTH${String(numPart + 1).padStart(5, "0")}`;
}

export interface CreateStockCheckInput {
  code?: string;
  branch?: string;
  staff?: string;
  note?: string;
  tags?: string[];
  status?: StockCheckStatus;
  items: StockCheckItem[];
}

export async function createStockCheck(input: CreateStockCheckInput): Promise<StockCheck> {
  if (!isDatabaseConfigured) {
    throw new Error("Database chưa được cấu hình (thiếu DATABASE_URL).");
  }
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Advisory lock tránh race condition khi 2 request cùng gọi
    // getNextStockCheckCode() đồng thời — cả 2 sẽ serialize qua lock này.
    // Key = hash của "stock_check" để tránh đụng với các advisory lock khác.
    await client.query("select pg_advisory_xact_lock(hashtext('stock_check_code'))");

    const code = input.code?.trim() || (await getNextStockCheckCode());

    const items = (input.items ?? [])
      .filter((it) => it.product_name || it.sku)
      .map((it, index) => {
        const sys = num(it.system_quantity);
        const act = num(it.actual_quantity);
        return {
          product_id: it.product_id,
          sku: str(it.sku),
          product_name: str(it.product_name),
          unit: str(it.unit),
          image_url: str(it.image_url),
          system_quantity: sys,
          actual_quantity: act,
          variance: act - sys,
          variance_reason: str(it.variance_reason),
          note: str(it.note),
          position: index + 1
        };
      });

    const stats = recomputeStats(items);

    const orderResult = await client.query(
      `insert into stock_checks (
        code, branch, staff, note, tags, status,
        total_items, matched_items, variance_items
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      returning *`,
      [
        code,
        str(input.branch, "Chi nhánh mặc định"),
        str(input.staff),
        str(input.note),
        input.tags ?? [],
        input.status ?? "draft",
        stats.total,
        stats.matched,
        stats.variance
      ]
    );

    const newRow = orderResult.rows[0];

    for (const item of items) {
      await client.query(
        `insert into stock_check_items (
          stock_check_id, product_id, sku, product_name, unit, image_url,
          system_quantity, actual_quantity, variance, variance_reason, note, position
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          newRow.id,
          item.product_id,
          item.sku,
          item.product_name,
          item.unit,
          item.image_url,
          item.system_quantity,
          item.actual_quantity,
          item.variance,
          item.variance_reason,
          item.note,
          item.position
        ]
      );
    }

    await client.query("commit");

    const result = await getStockCheck(newRow.id);
    if (!result) throw new Error("Không tải được phiếu kiểm hàng vừa tạo.");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface SystemStockRow {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  system_quantity: number;
}

export async function getSystemStockForCheck(): Promise<SystemStockRow[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  // Use sum of inventory_levels (or product.stock_quantity fallback) as "tồn chi nhánh".
  const result = await pool.query(`
    with variant_stock as (
      select pv.product_id,
             coalesce(sum(il.quantity), 0)::numeric as stock
      from product_variants pv
      left join inventory_levels il on il.variant_id = pv.id
      group by pv.product_id
    )
    select
      p.id as product_id,
      p.sku,
      p.name as product_name,
      coalesce(string_agg(distinct pv.unit, ', '), '') as unit,
      p.image_url,
      coalesce(vs.stock, coalesce(p.stock_quantity, 0))::numeric as system_quantity
    from products p
    left join product_variants pv on pv.product_id = p.id
    left join variant_stock vs on vs.product_id = p.id
    where p.status = 'active' or p.status is null
    group by p.id, vs.stock
    order by p.name asc
  `);
  return result.rows.map((row) => ({
    product_id: row.product_id,
    sku: str(row.sku),
    product_name: str(row.product_name),
    unit: str(row.unit),
    image_url: str(row.image_url),
    system_quantity: num(row.system_quantity)
  }));
}
