// File DUY NHẤT trong lib/promotions/ được phép đụng database.
// Component "use client" TUYỆT ĐỐI KHÔNG được import file này (sẽ kéo `pg` vào
// bundle trình duyệt → vỡ build). UI chỉ import ./types và ./validation.

import { isDatabaseConfigured, getPool, logActivity } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import {
  derivePromotionStatus,
  PROMOTION_METHOD_LABELS,
  type AddonByOrderTotalRules,
  type AppliedPromotionInput,
  type ByQuantityRules,
  type OrderTotalRules,
  type PerProductRules,
  type Promotion,
  type PromotionListRow,
  type PromotionMethod,
  type PromotionRules,
  type PromotionStatus,
  type PromotionType,
} from "./types";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

/** Nguồn chân lý DUY NHẤT cho "Đang chạy" — phải khớp derivePromotionStatus() ở types.ts. */
const RUNNING_SQL = `(
  p.status = 'active'
  and p.starts_at <= now()
  and (p.ends_at is null or p.ends_at >= now())
  and (p.usage_limit is null or p.usage_count < p.usage_limit)
)`;

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n);
}

function buildRuleSummary(method: PromotionMethod, rules: PromotionRules): string {
  try {
    switch (method) {
      case "order_total": {
        const r = rules as OrderTotalRules;
        const n = r.tiers?.length ?? 0;
        if (n === 0) return "Chưa cấu hình";
        const best = [...r.tiers].sort((a, b) => b.discount_value - a.discount_value)[0];
        return `${n} bậc, cao nhất giảm ${best.discount_type === "percent" ? `${best.discount_value}%` : `${fmtMoney(best.discount_value)}đ`}`;
      }
      case "per_product": {
        const r = rules as PerProductRules;
        return `${r.products?.length ?? 0} sản phẩm, mua từ ${r.min_quantity} sp giảm ${r.discount_type === "percent" ? `${r.discount_value}%` : `${fmtMoney(r.discount_value)}đ`}/sp`;
      }
      case "by_quantity": {
        const r = rules as ByQuantityRules;
        const rows = r.rows ?? [];
        const products = new Set(rows.map((x) => x.product_id)).size;
        return `${products} sản phẩm, ${rows.length} bậc số lượng`;
      }
      case "addon_by_order_total": {
        const r = rules as AddonByOrderTotalRules;
        return `Đơn từ ${fmtMoney(r.min_order_total)}đ, ${r.addon_products?.length ?? 0} sản phẩm mua thêm`;
      }
      default:
        return "";
    }
  } catch {
    return "";
  }
}

function rowToPromotion(row: any): Promotion {
  return {
    id: row.id,
    code: str(row.code),
    name: str(row.name),
    description: str(row.description),
    promo_type: (row.promo_type ?? "discount") as PromotionType,
    method: row.method as PromotionMethod,
    status: (row.status ?? "draft") as PromotionStatus,
    // pg đã tự parse jsonb thành object.
    rules: (row.rules ?? {}) as PromotionRules,
    usage_limit: row.usage_limit === null || row.usage_limit === undefined ? null : num(row.usage_limit),
    usage_count: num(row.usage_count),
    starts_at: row.starts_at,
    ends_at: row.ends_at ?? null,
    priority: num(row.priority),
    created_by: str(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToListRow(row: any): PromotionListRow {
  const promo = rowToPromotion(row);
  const { rules, ...rest } = promo;
  return {
    ...rest,
    // Suy lại bằng TS thay vì tin cột SQL — nếu 2 bên lệch nhau thì đó là bug tín hiệu.
    display_status: derivePromotionStatus(promo),
    remaining: promo.usage_limit === null ? null : promo.usage_limit - promo.usage_count,
    rule_summary: buildRuleSummary(promo.method, rules),
  };
}

// ─── Read ───────────────────────────────────────────────────────────────────

export interface PromotionFilters {
  search?: string;
  tab?: "all" | "running";
  status?: PromotionStatus | "all";
  method?: PromotionMethod | "all";
  promo_type?: PromotionType | "all";
  page?: number;
  page_size?: number;
}

export interface PromotionListResult {
  rows: PromotionListRow[];
  total: number;
  page: number;
  page_size: number;
  stats: { all: number; running: number; scheduled: number; ended: number };
}

export async function listPromotions(filters: PromotionFilters = {}): Promise<PromotionListResult> {
  const pageSize = Math.min(100, Math.max(10, filters.page_size ?? 20));
  const page = Math.max(1, filters.page ?? 1);
  const empty: PromotionListResult = {
    rows: [],
    total: 0,
    page,
    page_size: pageSize,
    stats: { all: 0, running: 0, scheduled: 0, ended: 0 },
  };
  if (!isDatabaseConfigured) return empty;
  await ensureDatabase();
  const pool = getPool();

  const where: string[] = [];
  const params: any[] = [];
  let i = 1;

  const q = filters.search?.trim();
  if (q) {
    where.push(`(p.code ilike $${i} or p.name ilike $${i})`);
    params.push(`%${q}%`);
    i++;
  }
  if (filters.tab === "running") {
    where.push(RUNNING_SQL);
  } else if (filters.status && filters.status !== "all") {
    where.push(`p.status = $${i++}`);
    params.push(filters.status);
  }
  if (filters.method && filters.method !== "all") {
    where.push(`p.method = $${i++}`);
    params.push(filters.method);
  }
  if (filters.promo_type && filters.promo_type !== "all") {
    where.push(`p.promo_type = $${i++}`);
    params.push(filters.promo_type);
  }
  const whereSql = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const offset = (page - 1) * pageSize;

  const [dataRes, statsRes] = await Promise.all([
    pool.query(
      `select p.*, count(*) over () as total_count
         from promotions p
         ${whereSql}
        order by p.created_at desc
        limit $${i} offset $${i + 1}`,
      [...params, pageSize, offset]
    ),
    pool.query(
      `select count(*)::int as all_count,
              count(*) filter (where ${RUNNING_SQL})::int as running_count,
              count(*) filter (where p.status = 'active' and p.starts_at > now())::int as scheduled_count,
              count(*) filter (where p.status = 'ended' or (p.ends_at is not null and p.ends_at < now()))::int as ended_count
         from promotions p`
    ),
  ]);

  const s = statsRes.rows[0] ?? {};
  return {
    rows: dataRes.rows.map(rowToListRow),
    total: num(dataRes.rows[0]?.total_count),
    page,
    page_size: pageSize,
    stats: {
      all: num(s.all_count),
      running: num(s.running_count),
      scheduled: num(s.scheduled_count),
      ended: num(s.ended_count),
    },
  };
}

export async function getPromotion(id: string): Promise<Promotion | null> {
  if (!isDatabaseConfigured || !isUuid(id)) return null;
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(`select * from promotions where id = $1::uuid limit 1`, [id]);
  if (res.rows.length === 0) return null;
  return rowToPromotion(res.rows[0]);
}

/** Chỉ CTKM đang thật sự chạy — dùng cho engine ở /api/promotions/apply. */
export async function listActivePromotions(): Promise<Promotion[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(
    `select * from promotions p
      where ${RUNNING_SQL} and p.promo_type = 'discount'
      order by p.priority desc, p.created_at desc
      limit 500`
  );
  return res.rows.map(rowToPromotion);
}

export async function getNextPromotionCode(): Promise<string> {
  if (!isDatabaseConfigured) return "KM000001";
  await ensureDatabase();
  const pool = getPool();
  // Dùng max()+1, KHÔNG dùng count(*) — đếm sẽ sinh mã trùng sau khi xoá bản ghi.
  const res = await pool.query(
    `select coalesce(max(nullif(regexp_replace(code, '^KM', ''), '')::int), 0) + 1 as next
       from promotions where code ~ '^KM[0-9]+$'`
  );
  const next = num(res.rows[0]?.next) || 1;
  return `KM${String(next).padStart(6, "0")}`;
}

// ─── Validate sản phẩm tồn tại + làm tươi tên/SKU ──────────────────────────

function collectProductIds(rules: PromotionRules): string[] {
  switch (rules.kind) {
    case "per_product":
      return rules.products.map((p) => p.product_id);
    case "by_quantity":
      return rules.rows.map((r) => r.product_id);
    case "addon_by_order_total":
      return rules.addon_products.map((p) => p.product_id);
    default:
      return [];
  }
}

/**
 * Lấy lại product_name/product_sku TỪ DB thay vì tin bản client gửi lên, đồng
 * thời chặn product_id không tồn tại. Tên được denormalize vào rules để sản
 * phẩm bị xoá sau này vẫn hiển thị được.
 */
async function hydrateAndValidateProducts(rules: PromotionRules): Promise<PromotionRules> {
  const ids = Array.from(new Set(collectProductIds(rules).filter(Boolean)));
  if (ids.length === 0) return rules;

  const pool = getPool();
  const res = await pool.query(
    `select id, name, coalesce(sku, '') as sku, coalesce(unit, '') as unit from products where id = any($1::uuid[])`,
    [ids]
  );
  const found = new Map<string, { name: string; sku: string; unit: string }>(
    res.rows.map((r: any) => [String(r.id), { name: str(r.name), sku: str(r.sku), unit: str(r.unit) }])
  );
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`Sản phẩm không tồn tại hoặc đã bị xoá (${missing.length} mục). Vui lòng chọn lại.`);
  }

  switch (rules.kind) {
    case "per_product":
      return {
        ...rules,
        products: rules.products.map((p) => ({
          ...p,
          product_name: found.get(p.product_id)!.name,
          product_sku: found.get(p.product_id)!.sku,
          unit: found.get(p.product_id)!.unit,
        })),
      };
    case "by_quantity":
      return {
        ...rules,
        rows: rules.rows.map((r) => ({
          ...r,
          product_name: found.get(r.product_id)!.name,
          product_sku: found.get(r.product_id)!.sku,
        })),
      };
    case "addon_by_order_total":
      return {
        ...rules,
        addon_products: rules.addon_products.map((p) => ({
          ...p,
          product_name: found.get(p.product_id)!.name,
          product_sku: found.get(p.product_id)!.sku,
          unit: found.get(p.product_id)!.unit,
        })),
      };
    default:
      return rules;
  }
}

// ─── Write ──────────────────────────────────────────────────────────────────

export interface CreatePromotionInput {
  code?: string;
  name: string;
  description?: string;
  promo_type?: PromotionType;
  method: PromotionMethod;
  status?: PromotionStatus;
  rules: PromotionRules;
  usage_limit?: number | null;
  starts_at?: string;
  ends_at?: string | null;
  priority?: number;
  created_by?: string;
}

export type UpdatePromotionInput = Partial<CreatePromotionInput>;

function assertNotGift(promoType: PromotionType | undefined) {
  // Chặn ở TẦNG REPOSITORY, không chỉ disable ở UI.
  if (promoType === "gift") {
    throw new Error("Loại khuyến mại 'Tặng sản phẩm' sắp có, chưa sử dụng được.");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

export async function createPromotion(input: CreatePromotionInput): Promise<Promotion> {
  if (!isDatabaseConfigured) throw new Error("Database is required to manage promotions.");
  assertNotGift(input.promo_type);
  if (!input.name?.trim()) throw new Error("Tên khuyến mại không được để trống.");
  if ((input.rules as { kind?: string })?.kind !== input.method) {
    throw new Error("Cấu hình điều kiện không khớp phương thức khuyến mại đã chọn.");
  }
  await ensureDatabase();
  const pool = getPool();

  const rules = await hydrateAndValidateProducts(input.rules);
  const code = input.code?.trim() || (await getNextPromotionCode());

  try {
    const res = await pool.query(
      `insert into promotions (code, name, description, promo_type, method, status, rules,
                               usage_limit, usage_count, starts_at, ends_at, priority, created_by,
                               created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,0,coalesce($9::timestamptz, now()),$10,$11,$12, now(), now())
       returning *`,
      [
        code,
        input.name.trim(),
        str(input.description),
        input.promo_type ?? "discount",
        input.method,
        input.status ?? "active",
        JSON.stringify(rules),
        input.usage_limit ?? null,
        input.starts_at ?? null,
        input.ends_at ?? null,
        input.priority ?? 0,
        str(input.created_by),
      ]
    );
    const promo = rowToPromotion(res.rows[0]);
    await logActivity("promotion", `Tạo khuyến mại ${promo.code} - ${promo.name}`);
    return promo;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("Mã khuyến mại đã tồn tại.");
    throw error;
  }
}

export async function updatePromotion(id: string, input: UpdatePromotionInput): Promise<Promotion | null> {
  if (!isDatabaseConfigured) throw new Error("Database is required to manage promotions.");
  if (!isUuid(id)) return null;
  assertNotGift(input.promo_type);
  await ensureDatabase();
  const pool = getPool();

  const existing = await getPromotion(id);
  if (!existing) return null;

  const method = input.method ?? existing.method;
  if (input.rules && (input.rules as { kind?: string }).kind !== method) {
    throw new Error("Cấu hình điều kiện không khớp phương thức khuyến mại đã chọn.");
  }

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;
  const set = (column: string, value: any) => {
    if (value !== undefined) {
      fields.push(`${column} = $${i++}`);
      values.push(value);
    }
  };

  set("code", input.code?.trim());
  set("name", input.name?.trim());
  set("description", input.description);
  set("promo_type", input.promo_type);
  set("method", input.method);
  set("status", input.status);
  if (input.rules !== undefined) {
    const rules = await hydrateAndValidateProducts(input.rules);
    fields.push(`rules = $${i++}::jsonb`);
    values.push(JSON.stringify(rules));
  }
  if (input.usage_limit !== undefined) {
    fields.push(`usage_limit = $${i++}`);
    values.push(input.usage_limit);
  }
  set("starts_at", input.starts_at);
  if (input.ends_at !== undefined) {
    fields.push(`ends_at = $${i++}`);
    values.push(input.ends_at);
  }
  set("priority", input.priority);

  if (fields.length === 0) return existing;
  values.push(id);

  try {
    const res = await pool.query(
      `update promotions set ${fields.join(", ")}, updated_at = now() where id = $${i}::uuid returning *`,
      values
    );
    if (res.rows.length === 0) return null;
    const promo = rowToPromotion(res.rows[0]);
    await logActivity("promotion", `Cập nhật khuyến mại ${promo.code} - ${promo.name}`);
    return promo;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("Mã khuyến mại đã tồn tại.");
    throw error;
  }
}

export async function setPromotionStatus(id: string, status: PromotionStatus): Promise<Promotion | null> {
  if (!isDatabaseConfigured) throw new Error("Database is required to manage promotions.");
  if (!isUuid(id)) return null;
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(
    `update promotions set status = $1, updated_at = now() where id = $2::uuid returning *`,
    [status, id]
  );
  if (res.rows.length === 0) return null;
  const promo = rowToPromotion(res.rows[0]);
  await logActivity("promotion", `Đổi trạng thái khuyến mại ${promo.code} → ${status}`);
  return promo;
}

export async function deletePromotion(id: string): Promise<boolean> {
  if (!isDatabaseConfigured) throw new Error("Database is required to manage promotions.");
  if (!isUuid(id)) return false;
  await ensureDatabase();
  const pool = getPool();
  // Xoá cứng — order_promotions.promotion_id là ON DELETE SET NULL và vẫn giữ
  // promotion_code/name nên đơn cũ vẫn đọc được lịch sử.
  const res = await pool.query(`delete from promotions where id = $1::uuid`, [id]);
  const deleted = (res.rowCount ?? 0) > 0;
  if (deleted) await logActivity("promotion", `Xoá khuyến mại ${id}`);
  return deleted;
}

// ─── Ghi nhận lượt dùng (gọi TRONG transaction của createOrder) ─────────────

export async function recordPromotionUsage(
  client: { query: (sql: string, params?: any[]) => Promise<any> },
  orderId: string,
  applied: AppliedPromotionInput[]
): Promise<void> {
  if (!applied || applied.length === 0) return;
  for (const promo of applied) {
    await client.query(
      `insert into order_promotions (order_id, promotion_id, promotion_code, promotion_name,
                                     method, discount_amount, snapshot)
       values ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        orderId,
        isUuid(promo.promotion_id) ? promo.promotion_id : null,
        str(promo.code),
        str(promo.name),
        str(promo.method),
        num(promo.discount_amount),
        JSON.stringify(promo.snapshot ?? {}),
      ]
    );

    if (!isUuid(promo.promotion_id)) continue;
    const res = await client.query(
      `update promotions
          set usage_count = usage_count + 1, updated_at = now()
        where id = $1::uuid
          and (usage_limit is null or usage_count < usage_limit)`,
      [promo.promotion_id]
    );
    // Hết lượt giữa chừng (đua tranh giữa lúc gợi ý và lúc thanh toán) → CẢNH
    // BÁO chứ không throw: không được chặn thu ngân giữa ca vì một bộ đếm
    // marketing. Muốn siết cứng thì đổi thành throw, transaction sẽ tự rollback.
    if ((res.rowCount ?? 0) === 0) {
      console.warn(
        `[promotions] Khuyến mại ${promo.code} (${promo.promotion_id}) đã hết lượt áp dụng nhưng vẫn được dùng cho đơn ${orderId}.`
      );
    }
  }
}

export { PROMOTION_METHOD_LABELS };
