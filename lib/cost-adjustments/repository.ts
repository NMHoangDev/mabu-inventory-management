import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

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
  const orderResult = isUuid(id)
    ? await pool.query(`select * from cost_adjustments where id = $1::uuid limit 1`, [id])
    : await pool.query(`select * from cost_adjustments where code = $1 limit 1`, [id]);
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
    // Advisory lock tránh race condition khi tạo code tự động đồng thời.
    await client.query("select pg_advisory_xact_lock(hashtext('cost_adjustment_code'))");

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

    // Apply cost updates to products/product_variants ONLY when completed.
    // Draft phiếu KHÔNG được tự ý cập nhật giá vốn (tránh lệch số liệu khi user
    // còn đang sửa bảng kê). Status transition (draft → completed) phải đi qua
    // PATCH endpoint riêng.
    if (input.status === "completed") {
      for (const item of items) {
        const newCost = Number(item.new_cost);
        if (!Number.isFinite(newCost) || newCost < 0) continue;
        if (!isUuid(item.product_id ?? "")) continue;
        // Cập nhật products (nguồn chính cho báo cáo giá vốn)
        await client.query(
          `update products
             set cost_price = $1, updated_at = now()
           where id = $2::uuid`,
          [newCost, item.product_id]
        );
        // Cập nhật product_variants (nếu có — nhiều variant cùng 1 product sẽ
        // được đồng bộ giá vốn theo product_id; nếu sau này cần per-variant,
        // đổi sang truyền variant_id từ input).
        await client.query(
          `update product_variants
             set cost_price = $1, updated_at = now()
           where product_id = $2::uuid`,
          [newCost, item.product_id]
        );
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

// ──────────────────────────────────────────────────────────────────────
// transitionCostAdjustmentStatus
// ──────────────────────────────────────────────────────────────────────
//
// createCostAdjustment() đã áp giá vốn mới ngay khi tạo với status='completed'.
// Hàm này phục vụ trường hợp còn lại: phiếu tạo ở 'draft'/'in_progress' rồi
// sau đó mới "Hoàn thành" (áp giá) hoặc "Hủy" — trước đây route PATCH này
// chưa từng được tạo dù comment trong createCostAdjustment() đã nhắc tới,
// nên phiếu draft không có cách nào áp giá được nữa (kẹt vĩnh viễn). Không
// cần cột "applied_at" như goods-receipts/stock-checks vì máy trạng thái chỉ
// cho vào 'completed' đúng 1 lần (completed là trạng thái cuối, không quay lại).
export async function transitionCostAdjustmentStatus(input: {
  costAdjustmentId: string;
  nextStatus: "in_progress" | "completed" | "cancelled";
}): Promise<{ success: boolean; message: string }> {
  if (!isDatabaseConfigured) {
    return { success: false, message: "Database chưa cấu hình." };
  }
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const caRes = await client.query(
      `select id, status from cost_adjustments where id = $1::uuid`,
      [input.costAdjustmentId]
    );
    if (caRes.rows.length === 0) {
      await client.query("rollback");
      return { success: false, message: "Không tìm thấy phiếu điều chỉnh." };
    }
    const cur = String(caRes.rows[0].status);
    const next = input.nextStatus;
    const allowed: Record<string, string[]> = {
      draft: ["in_progress", "completed", "cancelled"],
      in_progress: ["completed", "cancelled"],
      completed: [],
      cancelled: []
    };
    if (!allowed[cur]?.includes(next)) {
      await client.query("rollback");
      return { success: false, message: `Không thể đổi từ "${cur}" sang "${next}".` };
    }

    if (next === "completed") {
      const itemsRes = await client.query(
        `select product_id, new_cost from cost_adjustment_items where cost_adjustment_id = $1::uuid`,
        [input.costAdjustmentId]
      );
      for (const item of itemsRes.rows) {
        const newCost = Number(item.new_cost);
        if (!Number.isFinite(newCost) || newCost < 0) continue;
        if (!isUuid(item.product_id ?? "")) continue;
        await client.query(
          `update products set cost_price = $1, updated_at = now() where id = $2::uuid`,
          [newCost, item.product_id]
        );
        await client.query(
          `update product_variants set cost_price = $1, updated_at = now() where product_id = $2::uuid`,
          [newCost, item.product_id]
        );
      }
    }

    await client.query(
      `update cost_adjustments
          set status = $2,
              completed_at = case when $2 = 'completed' then now() else completed_at end,
              updated_at = now()
        where id = $1`,
      [input.costAdjustmentId, next]
    );

    await client.query("commit");
    const msg =
      next === "completed"
        ? "Đã áp giá vốn mới cho các sản phẩm."
        : next === "cancelled"
          ? "Đã hủy phiếu điều chỉnh."
          : `Đã chuyển trạng thái sang "${next}".`;
    return { success: true, message: msg };
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    console.error("transitionCostAdjustmentStatus failed:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Lỗi không xác định"
    };
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

export async function searchProductsForCostAdjustment(
  query: string,
  limit = 20
): Promise<ProductCostSearchHit[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const q = query.trim();
  // Search không dấu + chịu lỗi gõ thiếu/sai chữ, đồng bộ với
  // /api/orders/search-products (xem route đó để biết lý do từng điều kiện).
  const qNorm = q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\w\sÀ-ɏḀ-ỿ]/g, "");
  const qRaw = `%${q}%`;
  const qAcc = `%${qNorm}%`;
  const safeLimit = Math.min(50, Math.max(1, limit));
  const result = await pool.query(
    `select
       p.id as product_id,
       p.sku,
       p.name as product_name,
       coalesce(p.unit, '') as unit,
       coalesce(pi.url, '') as image_url,
       coalesce(p.cost_price, 0)::numeric as current_cost
     from products p
     left join lateral (
       select url from product_images where product_id = p.id order by position asc limit 1
     ) pi on true
     left join product_search_usage psu on psu.product_id = p.id
     where p.status = 'active'
       and (
         $1 = ''
         or p.sku ilike $2
         or p.name ilike $2
         or coalesce(p.barcode,'') ilike $2
         or p.search_text ilike $3
         or ($1 <> '' and similarity(coalesce(p.search_text, ''), $4) > 0.25)
       )
     order by
       case
         when lower(p.sku) = lower($1) then 0
         when coalesce(p.barcode,'') = $1 then 0
         when lower(p.name) like lower($1 || '%') then 1
         when lower(p.sku) like lower($1 || '%') then 1
         else 2
       end,
       -- "Ghi nhớ tìm kiếm": sản phẩm vừa được chọn gần đây lên trước, giống
       -- /api/orders/search-products — trước đây thiếu nên tìm kiếm ở trang
       -- điều chỉnh giá vốn không "nhớ" gì cả dù dùng chung bảng usage.
       coalesce(psu.last_used_at, '-infinity'::timestamptz) desc,
       coalesce(psu.use_count, 0) desc,
       similarity(coalesce(p.search_text, ''), $4) desc,
       p.name asc
     limit $5`,
    [q, qRaw, qAcc, qNorm, safeLimit]
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
