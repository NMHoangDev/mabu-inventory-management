import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { addStockForGoodsReceiptItems } from "../inventory/receipts";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export type GoodsReceiptStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type OrderStatusType = "pending" | "in_progress" | "completed" | "cancelled";
// Trạng thái thanh toán — TÁCH RIÊNG khỏi receipt_status/order_status (trạng
// thái nhập hàng/tồn kho). Derive giống orders.payment_status.
export type GoodsReceiptPaymentStatus = "unpaid" | "partial" | "paid";

export interface GoodsReceiptItem {
  id?: string;
  purchase_order_item_id: string | null;
  product_id: string | null;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  ordered_qty: number;
  received_qty: number;
  unit_cost: number;
  discount: number;
  line_total: number;
  position: number;
  note: string;
}

export interface GoodsReceipt {
  id: string;
  code: string;
  supplier_id: string | null;
  supplier_name: string;
  supplier_phone: string;
  purchase_order_id: string | null;
  purchase_order_code: string;
  branch: string;
  staff: string;
  received_at: string;
  expected_date: string | null;
  note: string;
  tags: string[];
  receipt_status: GoodsReceiptStatus;
  order_status: OrderStatusType;
  payment_status: GoodsReceiptPaymentStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total_cost: number;
  total_quantity: number;
  paid: number;
  payment_method: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  items: GoodsReceiptItem[];
}

export interface GoodsReceiptListRow {
  id: string;
  code: string;
  supplier_id: string | null;
  supplier_name: string;
  branch: string;
  staff: string;
  received_at: string;
  receipt_status: GoodsReceiptStatus;
  order_status: OrderStatusType;
  payment_status: GoodsReceiptPaymentStatus;
  total_cost: number;
  total_quantity: number;
  paid: number;
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

function rowToListRow(row: any): GoodsReceiptListRow {
  return {
    id: row.id,
    code: str(row.code),
    supplier_id: row.supplier_id,
    supplier_name: str(row.supplier_name),
    branch: str(row.branch, "Chi nhánh mặc định"),
    staff: str(row.staff),
    received_at: row.received_at,
    receipt_status: row.receipt_status,
    order_status: row.order_status,
    payment_status: row.payment_status ?? "unpaid",
    total_cost: num(row.total_cost),
    total_quantity: num(row.total_quantity),
    paid: num(row.paid),
    created_at: row.created_at
  };
}

function rowToReceipt(row: any, items: any[]): GoodsReceipt {
  return {
    id: row.id,
    code: str(row.code),
    supplier_id: row.supplier_id,
    supplier_name: str(row.supplier_name),
    supplier_phone: str(row.supplier_phone),
    purchase_order_id: row.purchase_order_id,
    purchase_order_code: str(row.purchase_order_code),
    branch: str(row.branch, "Chi nhánh mặc định"),
    staff: str(row.staff),
    received_at: row.received_at,
    expected_date: row.expected_date,
    note: str(row.note),
    tags: Array.isArray(row.tags) ? row.tags : [],
    receipt_status: row.receipt_status,
    order_status: row.order_status,
    payment_status: row.payment_status ?? "unpaid",
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    tax: num(row.tax),
    total_cost: num(row.total_cost),
    total_quantity: num(row.total_quantity),
    paid: num(row.paid),
    payment_method: str(row.payment_method),
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    items: items.map((it) => ({
      id: it.id,
      purchase_order_item_id: it.purchase_order_item_id,
      product_id: it.product_id,
      sku: str(it.sku),
      product_name: str(it.product_name),
      unit: str(it.unit),
      image_url: str(it.image_url),
      ordered_qty: num(it.ordered_qty),
      received_qty: num(it.received_qty),
      unit_cost: num(it.unit_cost),
      discount: num(it.discount),
      line_total: num(it.line_total),
      position: num(it.position) || 1,
      note: str(it.note)
    }))
  };
}

export async function listGoodsReceipts(): Promise<GoodsReceiptListRow[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const result = await pool.query(`
    select id, code, supplier_id, supplier_name, branch, staff,
           received_at, receipt_status, order_status, payment_status, paid,
           total_cost, total_quantity, created_at
    from goods_receipts
    order by created_at desc
  `);
  return result.rows.map(rowToListRow);
}

export async function getGoodsReceipt(id: string): Promise<GoodsReceipt | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const pool = getPool();

  const isUuidParam = isUuid(id);
  const orderResult = isUuidParam
    ? await pool.query(`select * from goods_receipts where id = $1::uuid limit 1`, [id])
    : await pool.query(`select * from goods_receipts where code = $1 limit 1`, [id]);
  if (orderResult.rows.length === 0) return null;
  const itemsResult = await pool.query(
    `select * from goods_receipt_items where goods_receipt_id = $1 order by position asc, created_at asc`,
    [orderResult.rows[0].id]
  );
  return rowToReceipt(orderResult.rows[0], itemsResult.rows);
}

export async function getNextGoodsReceiptCode(): Promise<string> {
  if (!isDatabaseConfigured) return "PON00001";
  await ensureDatabase();
  const pool = getPool();
  const result = await pool.query(`
    select code from goods_receipts
    where code ~ '^PON[0-9]+$'
    order by length(code) desc, code desc
    limit 1
  `);
  if (result.rows.length === 0) return "PON00001";
  const current = String(result.rows[0].code);
  const numPart = parseInt(current.replace(/\D/g, ""), 10);
  if (!Number.isFinite(numPart)) return "PON00001";
  return `PON${String(numPart + 1).padStart(5, "0")}`;
}

export interface CreateGoodsReceiptInput {
  code?: string;
  supplier_id?: string | null;
  supplier_name?: string;
  supplier_phone?: string;
  purchase_order_id?: string | null;
  purchase_order_code?: string;
  branch?: string;
  staff?: string;
  received_at?: string;
  expected_date?: string | null;
  note?: string;
  tags?: string[];
  receipt_status?: GoodsReceiptStatus;
  order_status?: OrderStatusType;
  discount?: number;
  tax?: number;
  paid?: number;
  payment_method?: string;
  items: GoodsReceiptItem[];
}

export async function createGoodsReceipt(input: CreateGoodsReceiptInput): Promise<GoodsReceipt> {
  if (!isDatabaseConfigured) {
    throw new Error("Database chưa được cấu hình (thiếu DATABASE_URL).");
  }
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Advisory lock tránh race condition khi generate code tự động.
    await client.query("select pg_advisory_xact_lock(hashtext('goods_receipt_code'))");

    const code = input.code?.trim() || (await getNextGoodsReceiptCode());

    const items = (input.items ?? [])
      .filter((it) => it.product_name || it.sku)
      .map((it, index) => {
        const ord = num(it.ordered_qty);
        const rec = num(it.received_qty);
        const uc = num(it.unit_cost);
        const disc = num(it.discount);
        return {
          purchase_order_item_id: it.purchase_order_item_id,
          product_id: it.product_id,
          sku: str(it.sku),
          product_name: str(it.product_name),
          unit: str(it.unit),
          image_url: str(it.image_url),
          ordered_qty: ord,
          received_qty: rec,
          unit_cost: uc,
          discount: disc,
          line_total: Math.max(ord * uc - disc, 0),
          position: index + 1,
          note: str(it.note)
        };
      });

    const subtotal = items.reduce((sum, it) => sum + num(it.ordered_qty) * num(it.unit_cost), 0);
    const discount = input.discount != null ? num(input.discount) : 0;
    const tax = input.tax != null ? num(input.tax) : 0;
    const paid = input.paid != null ? num(input.paid) : 0;
    const totalCost = Math.max(subtotal - discount + tax, 0);
    const totalQty = items.reduce((sum, it) => sum + num(it.received_qty), 0);

    const receiptStatus = input.receipt_status ?? "pending";
    const orderStatus = input.order_status ?? "pending";

    const orderResult = await client.query(
      `insert into goods_receipts (
        code, supplier_id, supplier_name, supplier_phone,
        purchase_order_id, purchase_order_code,
        branch, staff, received_at, expected_date,
        note, tags, receipt_status, order_status,
        subtotal, discount, tax, total_cost, total_quantity, paid, payment_method,
        completed_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      returning *`,
      [
        code,
        input.supplier_id ?? null,
        str(input.supplier_name),
        str(input.supplier_phone),
        input.purchase_order_id ?? null,
        str(input.purchase_order_code),
        str(input.branch, "Chi nhánh mặc định"),
        str(input.staff),
        input.received_at ?? new Date().toISOString(),
        input.expected_date ?? null,
        str(input.note),
        input.tags ?? [],
        receiptStatus,
        orderStatus,
        subtotal,
        discount,
        tax,
        totalCost,
        totalQty,
        paid,
        str(input.payment_method, "cash"),
        receiptStatus === "completed" ? new Date().toISOString() : null
      ]
    );

    const newRow = orderResult.rows[0];

    for (const item of items) {
      await client.query(
        `insert into goods_receipt_items (
          goods_receipt_id, purchase_order_item_id, product_id, sku,
          product_name, unit, image_url, ordered_qty, received_qty,
          unit_cost, discount, line_total, position, note
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          newRow.id,
          item.purchase_order_item_id,
          item.product_id,
          item.sku,
          item.product_name,
          item.unit,
          item.image_url,
          item.ordered_qty,
          item.received_qty,
          item.unit_cost,
          item.discount,
          item.line_total,
          item.position,
          item.note
        ]
      );
    }

    // Tự động gắn sản phẩm ↔ nhà cung cấp (product_suppliers) — đơn nhập hàng
    // đã có sẵn supplier_id + danh sách sản phẩm, không cần user tự vào từng
    // NCC để thêm sản phẩm cung cấp thủ công.
    if (input.supplier_id && isUuid(input.supplier_id)) {
      const productIds = Array.from(new Set(items.map((it) => it.product_id).filter((id): id is string => !!id)));
      if (productIds.length > 0) {
        await client
          .query(
            `insert into product_suppliers (product_id, supplier_id)
             select unnest($2::uuid[]), $1::uuid
             on conflict (product_id, supplier_id) do nothing`,
            [input.supplier_id, productIds]
          )
          .catch(() => undefined);
      }
    }

    // Cộng tồn kho NGAY khi tạo đơn với trạng thái "completed" (nút "Tạo &
    // nhập hàng" — hàng đã về, tách biệt hoàn toàn khỏi thanh toán). Trước
    // đây bug: status hiển thị "Hoàn thành" ngay nhưng tồn kho KHÔNG được
    // cộng, vì logic cộng tồn kho chỉ tồn tại trong transitionGoodsReceiptStatus
    // (endpoint PATCH /status riêng) — không được gọi ở đây.
    if (receiptStatus === "completed") {
      await addStockForGoodsReceiptItems(client, newRow.id, code);
    }

    // Update purchase_order status if linked
    // - Tất cả items đã nhận đủ + GR completed → PO completed
    // - Một phần items đã nhận → PO partial
    // - Chưa nhận gì → PO pending (giữ nguyên)
    if (input.purchase_order_id && isUuid(input.purchase_order_id)) {
      const itemsArr = input.items ?? [];
      const allCompleted =
        itemsArr.length > 0 &&
        itemsArr.every(
          (it) => Number(it.received_qty ?? 0) >= Number(it.ordered_qty ?? 0)
        );
      const anyReceived = itemsArr.some(
        (it) => Number(it.received_qty ?? 0) > 0
      );
      const newPoStatus = allCompleted
        ? "completed"
        : anyReceived
          ? "partial"
          : "pending";
      await client.query(
        `update purchase_orders
           set status = $1, updated_at = now()
         where id = $2::uuid`,
        [newPoStatus, input.purchase_order_id]
      ).catch(() => undefined);
    }

    await client.query("commit");

    const result = await getGoodsReceipt(newRow.id);
    if (!result) throw new Error("Không tải được đơn nhập hàng vừa tạo.");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface GoodsReceiptProductHit {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  default_cost: number;
}

export async function searchProductsForReceipt(query: string): Promise<GoodsReceiptProductHit[]> {
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
       coalesce(min(pv.cost_price), 0)::numeric as default_cost
     from products p
     left join product_variants pv on pv.product_id = p.id
     where p.sku ilike $1 or p.name ilike $1
     group by p.id
     order by p.name asc
     limit 20`,
    [q]
  );
  return result.rows.map((row) => ({
    product_id: String(row.product_id),
    sku: String(row.sku ?? ""),
    product_name: String(row.product_name ?? ""),
    unit: String(row.unit ?? ""),
    image_url: String(row.image_url ?? ""),
    default_cost: Number(row.default_cost ?? 0)
  }));
}

// ---------------------------------------------------------------------------
// Used by scan modal: search products by SKU OR name (LIKE), returning stock so
// the frontend can show "tồn: X" alongside each option. Lighter than the goods-
// receipt variant because scan only needs id/sku/name/unit/stock.
// ---------------------------------------------------------------------------
export interface ScanProductSearchHit {
  id: string;
  sku: string;
  name: string;
  unit: string;
  stock: number;
}

// Cùng chất lượng tìm kiếm với /api/orders/search-products (unaccent +
// trigram + ưu tiên sản phẩm vừa chọn gần đây qua product_search_usage) —
// trước đây chỉ ILIKE phẳng, không chịu được gõ thiếu dấu/sai chữ và không
// có "ghi nhớ tìm kiếm" như trang tạo đơn hàng.
export async function searchProductsForScan(query: string, limit = 15): Promise<ScanProductSearchHit[]> {
  if (!isDatabaseConfigured) return [];
  const q = query.trim();
  if (q.length < 1) return [];
  await ensureDatabase();
  const pool = getPool();

  const qNorm = q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\w\sÀ-ɏḀ-ỿ]/g, "");
  const qRaw = `%${q}%`;
  const qAcc = `%${qNorm}%`;
  const safeLimit = Math.max(1, Math.min(limit, 50));

  const result = await pool.query(
    `select p.id, p.sku, p.name, p.unit, coalesce(p.stock, 0) as stock
       from products p
       left join product_search_usage psu on psu.product_id = p.id
      where p.status = 'active'
        and (
          p.sku ilike $1
          or p.name ilike $1
          or coalesce(p.barcode,'') ilike $1
          or p.search_text ilike $2
          or similarity(coalesce(p.search_text, ''), $5) > 0.25
        )
      order by
        case
          when lower(p.sku) = lower($3) then 0
          when coalesce(p.barcode,'') = $3 then 0
          when lower(p.sku) like lower($4) then 1
          when lower(p.name) like lower($4) then 2
          when p.name ilike $1 then 3
          when p.sku ilike $1 then 4
          else 5
        end,
        coalesce(psu.last_used_at, '-infinity'::timestamptz) desc,
        coalesce(psu.use_count, 0) desc,
        similarity(coalesce(p.search_text, ''), $5) desc,
        length(p.name) asc,
        p.name asc
      limit $6`,
    [qRaw, qAcc, q, `${q}%`, qNorm, safeLimit]
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    sku: String(row.sku ?? ""),
    name: String(row.name ?? ""),
    unit: String(row.unit ?? ""),
    stock: Number(row.stock ?? 0)
  }));
}

// Look up a single product by exact SKU. Returns null when not found.
// Used as a fast path in the scan modal: row's SKU already exists → return it.
export async function findProductByExactSku(sku: string): Promise<ScanProductSearchHit | null> {
  if (!isDatabaseConfigured || sku.trim().length === 0) return null;
  await ensureDatabase();
  const pool = getPool();
  const result = await pool.query(
    `select id, sku, name, unit, coalesce(stock, 0) as stock
       from products
      where sku = $1
      limit 1`,
    [sku.trim()]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: String(row.id),
    sku: String(row.sku ?? ""),
    name: String(row.name ?? ""),
    unit: String(row.unit ?? ""),
    stock: Number(row.stock ?? 0)
  };
}
