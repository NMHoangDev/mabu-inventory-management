import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";

export type CostAdjustmentStatus = "draft" | "completed" | "cancelled";

export interface CostAdjustmentItem {
  id?: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  current_cost: number;
  new_cost: number;
  variance: number;
  position: number;
  note: string;
}

export interface CostAdjustment {
  id: string;
  code: string;
  branch: string;
  staff: string;
  note: string;
  tags: string[];
  status: CostAdjustmentStatus;
  total_items: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  items: CostAdjustmentItem[];
}

export interface CostAdjustmentListRow {
  id: string;
  code: string;
  branch: string;
  staff: string;
  status: CostAdjustmentStatus;
  total_items: number;
  created_at: string;
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

function rowToListRow(row: any): CostAdjustmentListRow {
  return {
    id: row.id,
    code: str(row.code),
    branch: str(row.branch, "Chi nhánh mặc định"),
    staff: str(row.staff),
    status: row.status,
    total_items: num(row.total_items),
    created_at: row.created_at
  };
}

function rowToAdjustment(row: any, items: any[]): CostAdjustment {
  return {
    id: row.id,
    code: str(row.code),
    branch: str(row.branch, "Chi nhánh mặc định"),
    staff: str(row.staff),
    note: str(row.note),
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status,
    total_items: num(row.total_items),
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
      current_cost: num(it.current_cost),
      new_cost: num(it.new_cost),
      variance: num(it.variance),
      position: num(it.position) || 1,
      note: str(it.note)
    }))
  };
}

export async function listCostAdjustments(): Promise<CostAdjustmentListRow[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const result = await pool.query(`
    select id, code, branch, staff, status, total_items, created_at
    from cost_adjustments
    order by created_at desc
  `);
  return result.rows.map(rowToListRow);
}

export async function getCostAdjustment(id: string): Promise<CostAdjustment | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const pool = getPool();
  const orderResult = await pool.query(
    `select * from cost_adjustments where id = $1 or code = $1 limit 1`,
    [id]
  );
  if (orderResult.rows.length === 0) return null;
  const itemsResult = await pool.query(
    `select * from cost_adjustment_items where cost_adjustment_id = $1 order by position asc, created_at asc`,
    [orderResult.rows[0].id]
  );
  return rowToAdjustment(orderResult.rows[0], itemsResult.rows);
}

export async function getNextCostAdjustmentCode(): Promise<string> {
  if (!isDatabaseConfigured) return "CPV00001";
  await ensureDatabase();
  const pool = getPool();
  const result = await pool.query(`
    select code from cost_adjustments
    where code ~ '^CPV[0-9]+$'
    order by length(code) desc, code desc
    limit 1
  `);
  if (result.rows.length === 0) return "CPV00001";
  const current = String(result.rows[0].code);
  const numPart = parseInt(current.replace(/\D/g, ""), 10);
  if (!Number.isFinite(numPart)) return "CPV00001";
  return `CPV${String(numPart + 1).padStart(5, "0")}`;
}

export interface CreateCostAdjustmentInput {
  code?: string;
  branch?: string;
  staff?: string;
  note?: string;
  tags?: string[];
  status?: CostAdjustmentStatus;
  items: CostAdjustmentItem[];
}

export async function createCostAdjustment(input: CreateCostAdjustmentInput): Promise<CostAdjustment> {
  if (!isDatabaseConfigured) throw new Error("Database chưa được cấu hình.");
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const code = input.code?.trim() || (await getNextCostAdjustmentCode());

    const items = (input.items ?? [])
      .filter((it) => it.product_name || it.sku)
      .map((it, index) => ({
        product_id: it.product_id,
        sku: str(it.sku),
        product_name: str(it.product_name),
        unit: str(it.unit),
        image_url: str(it.image_url),
        current_cost: num(it.current_cost),
        new_cost: num(it.new_cost),
        variance: num(it.new_cost) - num(it.current_cost),
        position: index + 1,
        note: str(it.note)
      }));

    const adjResult = await client.query(
      `insert into cost_adjustments (code, branch, staff, note, tags, status, total_items)
       values ($1,$2,$3,$4,$5,$6,$7)
       returning *`,
      [
        code,
        str(input.branch, "Chi nhánh mặc định"),
        str(input.staff),
        str(input.note),
        input.tags ?? [],
        input.status ?? "draft",
        items.length
      ]
    );
    const newRow = adjResult.rows[0];

    for (const item of items) {
      await client.query(
        `insert into cost_adjustment_items (
          cost_adjustment_id, product_id, sku, product_name, unit, image_url,
          current_cost, new_cost, variance, position, note
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          newRow.id,
          item.product_id, item.sku, item.product_name, item.unit, item.image_url,
          item.current_cost, item.new_cost, item.variance, item.position, item.note
        ]
      );
    }

    // Apply cost updates to product_variants if status is completed
    if (input.status === "completed" || input.status === "draft") {
      for (const item of items) {
        if (item.product_id) {
          await client.query(
            `update product_variants
               set cost_price = $1, updated_at = now()
             where product_id = $2`,
            [item.new_cost, item.product_id]
          ).catch(() => undefined);
          await client.query(
            `update products set cost_price = $1, updated_at = now()
               where id = $2`,
            [item.new_cost, item.product_id]
          ).catch(() => undefined);
        }
      }
    }

    await client.query("commit");
    const result = await getCostAdjustment(newRow.id);
    if (!result) throw new Error("Không tải được phiếu điều chỉnh vừa tạo.");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface ProductCostSearchHit {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  current_cost: number;
}

export async function searchProductsForCostAdjustment(query: string): Promise<ProductCostSearchHit[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const q = `%${query.trim()}%`;
  const result = await pool.query(
    `select
       p.id as product_id,
       p.sku,
       p.name as product_name,
       coalesce(string_agg(distinct pv.unit, ', '), '') as unit,
       p.image_url,
       coalesce(min(pv.cost_price), coalesce(p.cost_price, 0))::numeric as current_cost
     from products p
     left join product_variants pv on pv.product_id = p.id
     where p.sku ilike $1 or p.name ilike $1
     group by p.id
     order by p.name asc
     limit 20`,
    [q]
  );
  return result.rows.map((row) => ({
    product_id: row.product_id,
    sku: str(row.sku),
    product_name: str(row.product_name),
    unit: str(row.unit),
    image_url: str(row.image_url),
    current_cost: num(row.current_cost)
  }));
}
