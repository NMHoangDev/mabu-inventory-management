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
  stock_applied_at?: string | null;
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
      position: num(it.position) || 1,
      stock_applied_at: it.stock_applied_at ?? null
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

    const status = input.status ?? "draft";
    const orderResult = await client.query(
      `insert into stock_checks (
        code, branch, staff, note, tags, status,
        total_items, matched_items, variance_items, completed_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      returning *`,
      [
        code,
        str(input.branch, "Chi nhánh mặc định"),
        str(input.staff),
        str(input.note),
        input.tags ?? [],
        status,
        stats.total,
        stats.matched,
        stats.variance,
        status === "balanced" ? new Date().toISOString() : null
      ]
    );

    const newRow = orderResult.rows[0];

    // Bulk insert TOÀN BỘ item trong 1 câu (thay vì N insert tuần tự) — với
    // file nhập Excel có thể lên tới hàng trăm dòng, N round-trip riêng tới
    // Supabase (network xa) là phần chiếm phần lớn thời gian "Cân bằng kho".
    if (items.length > 0) {
      await client.query(
        `insert into stock_check_items (
          stock_check_id, product_id, sku, product_name, unit, image_url,
          system_quantity, actual_quantity, variance, variance_reason, note, position
        )
        select $1, t.product_id, t.sku, t.product_name, t.unit, t.image_url,
               t.system_quantity, t.actual_quantity, t.variance, t.variance_reason, t.note, t.position
        from unnest(
          $2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[],
          $7::numeric[], $8::numeric[], $9::numeric[], $10::text[], $11::text[], $12::int[]
        ) as t(product_id, sku, product_name, unit, image_url,
               system_quantity, actual_quantity, variance, variance_reason, note, position)`,
        [
          newRow.id,
          items.map((item) => item.product_id),
          items.map((item) => item.sku),
          items.map((item) => item.product_name),
          items.map((item) => item.unit),
          items.map((item) => item.image_url),
          items.map((item) => item.system_quantity),
          items.map((item) => item.actual_quantity),
          items.map((item) => item.variance),
          items.map((item) => item.variance_reason),
          items.map((item) => item.note),
          items.map((item) => item.position)
        ]
      );
    }

    // Cân bằng NGAY khi tạo phiếu với status='balanced' — tách biệt khỏi chờ
    // gọi PATCH /status sau. Xem applyStockCheckVariance() phía trên.
    if (status === "balanced") {
      await applyStockCheckVariance(client, newRow.id, code);
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

// ──────────────────────────────────────────────────────────────────────
// transitionStockCheckStatus
// ──────────────────────────────────────────────────────────────────────
//
// "Cân bằng kiểm kê" (status → balanced) là hành động DUY NHẤT áp chênh
// lệch (variance = actual - system) vào tồn kho thật — trước đây phiếu kiểm
// hàng chỉ lưu số liệu, KHÔNG có bước nào đụng vào products.stock, nên toàn
// bộ mục đích "kiểm rồi sửa tồn" chưa từng thực sự chạy. Idempotent qua
// stock_check_items.stock_applied_at (giống pattern goods_receipt_items).
// Balanced/cancelled là trạng thái CUỐI — không hoàn tác (khác goods-receipts
// vì "chênh lệch kiểm kê" không có 1 khái niệm "hoàn lại" rõ nghĩa như nhập
// hàng; muốn sửa số thì tạo phiếu kiểm mới).
// Áp chênh lệch (variance = actual - system) vào tồn kho cho các item CHƯA
// áp (`stock_applied_at IS NULL`). Idempotent. Dùng lại ở CẢ 2 nơi:
//   1. createStockCheck — khi tạo phiếu với status='balanced' ngay từ đầu
//      ("Cân bằng luôn" ở trang tạo mới). Trước đây KHÔNG gọi gì cả — status
//      hiển thị "balanced" nhưng tồn kho chưa từng được sửa theo số kiểm thực tế.
//   2. transitionStockCheckStatus — khi cân bằng sau khi phiếu đã ở trạng
//      thái khác (draft/in_progress).
// PERF: bản cũ lặp N item với ~4 query/item (update products, resolve
// variant, resolve location, upsert inventory_levels, insert stock_movements,
// update marker) — với file nhập Excel vài trăm dòng, đây là hàng nghìn
// round-trip tuần tự tới Supabase (network xa) → "Cân bằng kho" mất vài
// phút. Bản dưới dồn TOÀN BỘ thành ~8 câu query bất kể N, không đổi hành vi
// (idempotent qua stock_applied_at, vẫn ghi đủ stock_movements + inventory_levels).
async function applyStockCheckVariance(
  client: any,
  stockCheckId: string,
  stockCheckCode: string
): Promise<{ stockApplied: boolean }> {
  const headerRes = await client.query(
    `select staff, branch from stock_checks where id = $1::uuid`,
    [stockCheckId]
  );
  const checkStaff = headerRes.rows[0]?.staff ?? "";
  const checkBranch = headerRes.rows[0]?.branch ?? "";
  const itemsRes = await client.query(
    `select id, product_id, variance, stock_applied_at
       from stock_check_items
      where stock_check_id = $1::uuid
      order by position asc`,
    [stockCheckId]
  );

  const pending = itemsRes.rows.filter((it: any) => !it.stock_applied_at);
  if (pending.length === 0) return { stockApplied: false };

  // Gộp theo product_id — cộng dồn delta để chỉ update tồn kho 1 lần/sản
  // phẩm. UI hiện tại chặn thêm 2 dòng cùng sản phẩm vào 1 phiếu nên trong
  // thực tế mỗi product_id chỉ xuất hiện 1 lần; gộp ở đây chỉ để an toàn.
  const toApplyIds: string[] = [];
  const toSkipIds: string[] = [];
  const deltaByProduct = new Map<string, number>();
  for (const item of pending) {
    const productId = item.product_id ? String(item.product_id) : null;
    const delta = Number(item.variance ?? 0);
    if (!productId || delta === 0) {
      toSkipIds.push(String(item.id));
      continue;
    }
    toApplyIds.push(String(item.id));
    deltaByProduct.set(productId, (deltaByProduct.get(productId) ?? 0) + delta);
  }

  if (deltaByProduct.size === 0) {
    if (toSkipIds.length > 0) {
      await client.query(
        `update stock_check_items set stock_applied_at = now() where id = any($1::uuid[])`,
        [toSkipIds]
      );
    }
    return { stockApplied: false };
  }

  const productIds = Array.from(deltaByProduct.keys());
  const deltas = productIds.map((id) => deltaByProduct.get(id)!);

  // 1) Cộng/trừ tồn kho thật — 1 update cho toàn bộ sản phẩm.
  const stockRes = await client.query(
    `update products p
        set stock = greatest(0, coalesce(p.stock, 0) + v.delta),
            stock_updated_at = now(),
            updated_at = now()
       from unnest($1::uuid[], $2::numeric[]) as v(id, delta)
      where p.id = v.id
      returning p.id, p.stock`,
    [productIds, deltas]
  );
  const resultingStockByProduct = new Map<string, number>(
    stockRes.rows.map((r: any) => [String(r.id), Number(r.stock)])
  );

  // 2) Đảm bảo mỗi sản phẩm có 1 product_variants mặc định (UI "Khả dụng"
  // đọc tồn qua variant/inventory_levels — xem applyInventoryLevelDelta ở
  // lib/inventory/receipts.ts). Hầu hết đã có sẵn từ lúc tạo sản phẩm; bulk
  // tạo bù cho phần thiếu (hiếm).
  const variantRes = await client.query(
    `select distinct on (product_id) product_id, id
       from product_variants
      where product_id = any($1::uuid[])
      order by product_id, position asc`,
    [productIds]
  );
  const variantByProduct = new Map<string, string>(
    variantRes.rows.map((r: any) => [String(r.product_id), String(r.id)])
  );
  const missingVariantProductIds = productIds.filter((id) => !variantByProduct.has(id));
  if (missingVariantProductIds.length > 0) {
    const createdVariants = await client.query(
      `insert into product_variants (product_id, title, sku, price, cost_price, position)
       select p.id, 'Mặc định',
              coalesce(nullif(p.sku, ''), 'SKU-' || substr(p.id::text, 1, 8)),
              coalesce(p.price, 0), 0, 1
         from products p
        where p.id = any($1::uuid[])
        returning product_id, id`,
      [missingVariantProductIds]
    );
    for (const r of createdVariants.rows) {
      variantByProduct.set(String(r.product_id), String(r.id));
    }
  }

  // 3) Location mặc định — resolve 1 LẦN (trước đây resolve lại mỗi item
  // dù kết quả luôn giống nhau từ lần thứ 2).
  const locRes = await client.query(
    `select id from locations order by is_default desc, created_at asc limit 1`
  );
  let locationId: string;
  if (locRes.rows.length > 0) {
    locationId = String(locRes.rows[0].id);
  } else {
    const createdLoc = await client.query(
      `insert into locations (name, is_default, is_active)
       values ('Cửa hàng chính', true, true)
       returning id`
    );
    locationId = String(createdLoc.rows[0].id);
  }

  // 4) Cộng/trừ inventory_levels (nguồn tồn "Khả dụng" trên UI) — upsert
  // bằng delta thô rồi clamp âm về 0 ở câu sau, thay vì phải SELECT "before"
  // riêng cho mỗi dòng như bản cũ (applyInventoryLevelDelta per-item).
  const variantIds = productIds.map((id) => variantByProduct.get(id)!);
  const locationIds = productIds.map(() => locationId);
  await client.query(
    `insert into inventory_levels (variant_id, location_id, quantity, updated_at)
     select t.variant_id, t.location_id, t.delta, now()
       from unnest($1::uuid[], $2::uuid[], $3::numeric[]) as t(variant_id, location_id, delta)
     on conflict (variant_id, location_id) do update set
       quantity = coalesce(inventory_levels.quantity, 0) + excluded.quantity,
       updated_at = now()`,
    [variantIds, locationIds, deltas]
  );
  await client.query(
    `update inventory_levels set quantity = 0, updated_at = now()
      where quantity < 0 and variant_id = any($1::uuid[])`,
    [variantIds]
  );

  // 5) Ghi lịch sử stock_movements — bulk insert 1 câu.
  const resultingStocksInOrder = productIds.map((id) => resultingStockByProduct.get(id) ?? 0);
  await client.query(
    `insert into stock_movements (
       product_id, movement_type, quantity_change, resulting_stock,
       reference_table, reference_id, reference_code, staff, branch
     )
     select t.product_id, 'stock_check', t.delta, t.resulting_stock,
            'stock_checks', $2::uuid, $3, $4, $5
       from unnest($1::uuid[], $6::numeric[], $7::numeric[]) as t(product_id, delta, resulting_stock)`,
    [productIds, stockCheckId, stockCheckCode, checkStaff, checkBranch, deltas, resultingStocksInOrder]
  );

  // 6) Đánh dấu tất cả item đã xử lý (cả nhóm áp lẫn nhóm bỏ qua) — 1 update.
  const allTouchedIds = [...toApplyIds, ...toSkipIds];
  await client.query(
    `update stock_check_items set stock_applied_at = now() where id = any($1::uuid[])`,
    [allTouchedIds]
  );

  console.info(
    `[stock] Cân bằng kiểm kê ${stockCheckCode}: áp tồn kho cho ${productIds.length} sản phẩm ` +
    `(${toApplyIds.length} dòng có chênh lệch, ${toSkipIds.length} dòng bỏ qua).`
  );

  return { stockApplied: true };
}

export async function transitionStockCheckStatus(input: {
  stockCheckId: string;
  nextStatus: "in_progress" | "balanced" | "cancelled";
}): Promise<{ success: boolean; message: string; stockApplied?: boolean }> {
  if (!isDatabaseConfigured) {
    return { success: false, message: "Database chưa cấu hình." };
  }
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const scRes = await client.query(
      `select id, status, code from stock_checks where id = $1::uuid`,
      [input.stockCheckId]
    );
    if (scRes.rows.length === 0) {
      await client.query("rollback");
      return { success: false, message: "Không tìm thấy phiếu kiểm hàng." };
    }
    const sc = scRes.rows[0];
    const cur = String(sc.status);
    const next = input.nextStatus;
    const allowed: Record<string, string[]> = {
      draft: ["in_progress", "balanced", "cancelled"],
      in_progress: ["balanced", "cancelled"],
      balanced: [],
      cancelled: []
    };
    if (!allowed[cur]?.includes(next)) {
      await client.query("rollback");
      return { success: false, message: `Không thể đổi từ "${cur}" sang "${next}".` };
    }

    let stockApplied = false;
    if (next === "balanced") {
      const result = await applyStockCheckVariance(client, input.stockCheckId, String(sc.code));
      stockApplied = result.stockApplied;
    }

    await client.query(
      `update stock_checks
          set status = $2,
              completed_at = case when $2 = 'balanced' then now() else completed_at end,
              updated_at = now()
        where id = $1`,
      [input.stockCheckId, next]
    );

    await client.query("commit");

    const msg =
      next === "balanced"
        ? "Đã cân bằng kiểm kê. Đã áp chênh lệch vào tồn kho."
        : next === "cancelled"
          ? "Đã hủy phiếu kiểm hàng."
          : `Đã chuyển trạng thái sang "${next}".`;
    return { success: true, message: msg, stockApplied };
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    console.error("transitionStockCheckStatus failed:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Lỗi không xác định"
    };
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
  // products.stock là tồn kho denormalized thật (cập nhật trực tiếp khi
  // đơn hàng deduct/restore — xem lib/orders/repository.ts). Bảng
  // product_variants/inventory_levels gần như không được dùng trong hệ
  // thống này (chỉ vài dòng lịch sử cũ), nên KHÔNG dùng làm nguồn tồn kho.
  const result = await pool.query(`
    select
      p.id as product_id,
      p.sku,
      p.name as product_name,
      coalesce(p.unit, '') as unit,
      coalesce(pi.url, '') as image_url,
      coalesce(p.stock, 0)::numeric as system_quantity
    from products p
    left join lateral (
      select url from product_images where product_id = p.id order by position asc limit 1
    ) pi on true
    where p.status = 'active' or p.status is null
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
