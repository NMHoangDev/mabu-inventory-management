import { ensureDatabase } from "../db/migration";
import { getPool, isDatabaseConfigured, logActivity } from "../db/connection";
import { applyInventoryLevelDelta } from "../inventory/receipts";
import { recordStockMovement } from "../inventory/stock-movements";
import { runTrigger, type RuleTrigger } from "../automations/engine";

function fireAutomation(trigger: RuleTrigger, payload: Record<string, any>) {
  runTrigger(trigger, payload).catch((e) => console.warn(`[automations] ${trigger} failed:`, e));
}

export type OrderStatus = "new" | "processing" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded";
// "confirmed"/"packing" thêm cho luồng xử lý đơn website: xác nhận → đóng gói
// → đang giao → đã giao, trước khi giao cho đơn vị vận chuyển/tự giao.
export type FulfillmentStatus = "unshipped" | "confirmed" | "packing" | "shipping" | "shipped" | "returned";
export type OrderSource = "store" | "facebook" | "website" | "zalo" | "other" | "pos";
// COD: payment_status chỉ chuyển "paid" khi fulfillment_status đạt "shipped"
// (thu tiền lúc giao xong). bank_transfer/card: khách trả trước, payment_status
// có thể "paid" ngay cả khi fulfillment_status còn "unshipped" (chưa giao).
export type PaymentMethod = "cod" | "bank_transfer" | "card" | "cash";

export type DiscountType = "amount" | "percent";

export interface OrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string;
  unit: string;
  image_url: string;
  quantity: number;
  unit_price: number;
  discount_type: DiscountType;
  discount_value: number;
  line_total: number;
}

export interface Order {
  id: string;
  code: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  payment_method: PaymentMethod;
  source: OrderSource;
  branch: string;
  staff: string;
  note: string;
  subtotal: number;
  discount: number;
  discount_type: DiscountType;
  shipping_fee: number;
  total: number;
  paid: number;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface OrderItemInput {
  product_id: string | null;
  product_name: string;
  product_sku?: string;
  unit?: string;
  image_url?: string;
  quantity: number;
  unit_price: number;
  discount_type?: DiscountType;
  discount_value?: number;
}

// Chiết khấu từng dòng sản phẩm — discount_value là số người dùng nhập
// (đ hoặc %, tuỳ discount_type), clamp về [0, thành tiền gốc] để không cho
// ra line_total âm.
export function lineItemDiscountAmount(quantity: number, unitPrice: number, discountType: DiscountType, discountValue: number): number {
  const base = quantity * unitPrice;
  const raw = discountType === "percent" ? (base * discountValue) / 100 : discountValue;
  return Math.min(base, Math.max(0, raw));
}

export function lineItemTotal(quantity: number, unitPrice: number, discountType: DiscountType, discountValue: number): number {
  return Math.max(0, quantity * unitPrice - lineItemDiscountAmount(quantity, unitPrice, discountType, discountValue));
}

// Chiết khấu tổng đơn (order-level, khác chiết khấu từng dòng ở trên) —
// discountValue là số người dùng nhập (đ hoặc %, tuỳ discountType), tính
// trên `base` = subtotal đã trừ chiết khấu từng dòng, clamp về [0, base].
export function orderDiscountAmount(base: number, discountType: DiscountType, discountValue: number): number {
  const raw = discountType === "percent" ? (base * discountValue) / 100 : discountValue;
  return Math.min(base, Math.max(0, raw));
}

export interface OrderInput {
  customer_id?: string | null;
  customer_name?: string;
  customer_phone?: string;
  status?: OrderStatus;
  payment_status?: PaymentStatus;
  fulfillment_status?: FulfillmentStatus;
  payment_method?: PaymentMethod;
  source?: OrderSource;
  branch?: string;
  staff?: string;
  note?: string;
  discount?: number;
  discount_type?: DiscountType;
  shipping_fee?: number;
  paid?: number;
  items?: OrderItemInput[];
}

export interface OrderStats {
  pending: number;        // Chờ duyệt
  awaiting_payment: number; // Chờ thanh toán
  awaiting_shipment: number; // Chờ giao hàng
  completed_today: number;
  revenue_today: number;
}

function rowToOrder(row: any, items: OrderItem[] = []): Order {
  return {
    id: row.id,
    code: row.code,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    status: row.status,
    payment_status: row.payment_status,
    fulfillment_status: row.fulfillment_status,
    payment_method: row.payment_method,
    source: row.source,
    branch: row.branch,
    staff: row.staff,
    note: row.note,
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    discount_type: row.discount_type === "percent" ? "percent" : "amount",
    shipping_fee: Number(row.shipping_fee ?? 0),
    total: Number(row.total ?? 0),
    paid: Number(row.paid ?? 0),
    items,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToItem(row: any): OrderItem {
  return {
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name,
    product_sku: row.product_sku,
    unit: row.unit,
    image_url: row.image_url,
    quantity: Number(row.quantity ?? 0),
    unit_price: Number(row.unit_price ?? 0),
    discount_type: row.discount_type === "percent" ? "percent" : "amount",
    discount_value: Number(row.discount_value ?? 0),
    line_total: Number(row.line_total ?? 0),
  };
}

// Context của đơn hàng đang gây ra thay đổi tồn kho — dùng để ghi lại
// "bán cho ai / đơn nào" vào stock_movements (tab "Lịch sử kho").
interface OrderStockContext {
  orderId: string;
  code: string;
  customerName?: string;
  staff?: string;
  branch?: string;
}

// ── Trừ/hoàn tồn kho khi đơn hàng chuyển sang/ra khỏi "completed" ───────────
// Mirror transitionGoodsReceiptStatus (lib/inventory/receipts.ts): cập nhật
// cả products.stock (denormalized, dùng cho dashboard/báo cáo) lẫn
// inventory_levels (nguồn UI "Khả dụng" ở /products) qua applyInventoryLevelDelta,
// đồng thời ghi 1 dòng stock_movements để tab "Lịch sử kho" hiển thị được.
async function deductStockForItem(client: any, productId: string, qty: number, logTag: string, ctx: OrderStockContext) {
  const res = await client.query(
    `update products set stock = greatest(0, coalesce(stock, 0) - $2), stock_updated_at = now(), updated_at = now() where id = $1 returning stock`,
    [productId, qty]
  );
  await applyInventoryLevelDelta(client, productId, -qty, logTag);
  await recordStockMovement(client, {
    productId,
    movementType: "order_sale",
    quantityChange: -qty,
    resultingStock: Number(res.rows[0]?.stock ?? 0),
    referenceTable: "orders",
    referenceId: ctx.orderId,
    referenceCode: ctx.code,
    customerName: ctx.customerName,
    staff: ctx.staff,
    branch: ctx.branch,
  });
}

async function restoreStockForItem(client: any, productId: string, qty: number, logTag: string, ctx: OrderStockContext) {
  const res = await client.query(
    `update products set stock = coalesce(stock, 0) + $2, stock_updated_at = now(), updated_at = now() where id = $1 returning stock`,
    [productId, qty]
  );
  await applyInventoryLevelDelta(client, productId, qty, logTag);
  await recordStockMovement(client, {
    productId,
    movementType: "order_restore",
    quantityChange: qty,
    resultingStock: Number(res.rows[0]?.stock ?? 0),
    referenceTable: "orders",
    referenceId: ctx.orderId,
    referenceCode: ctx.code,
    customerName: ctx.customerName,
    staff: ctx.staff,
    branch: ctx.branch,
  });
}

async function generateOrderCode(): Promise<string> {
  const pool = getPool();
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const prefix = `SON${yyyy}${mm}${dd}`;
  const res = await pool.query(
    `select count(*)::int as cnt from orders where code like $1`,
    [`${prefix}%`]
  );
  const next = String((res.rows[0]?.cnt ?? 0) + 1).padStart(3, "0");
  return `${prefix}${next}`;
}

export async function getOrderStats(): Promise<OrderStats> {
  const empty: OrderStats = { pending: 0, awaiting_payment: 0, awaiting_shipment: 0, completed_today: 0, revenue_today: 0 };
  if (!isDatabaseConfigured) return empty;
  await ensureDatabase();
  const pool = getPool();
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

  const [pending, awaitingPay, awaitingShip, completedToday, revenue] = await Promise.all([
    pool.query(`select count(*)::int as c from orders where status = 'new'`),
    pool.query(`select count(*)::int as c from orders where payment_status in ('unpaid', 'partial') and status != 'cancelled'`),
    pool.query(`select count(*)::int as c from orders where fulfillment_status in ('unshipped', 'confirmed', 'packing', 'shipping') and status != 'cancelled'`),
    pool.query(`select count(*)::int as c from orders where status = 'completed' and updated_at >= $1`, [todayStart]),
    pool.query(`select coalesce(sum(total), 0)::numeric as s from orders where status != 'cancelled' and created_at >= $1`, [todayStart]),
  ]);

  return {
    pending: pending.rows[0].c,
    awaiting_payment: awaitingPay.rows[0].c,
    awaiting_shipment: awaitingShip.rows[0].c,
    completed_today: completedToday.rows[0].c,
    revenue_today: Number(revenue.rows[0].s ?? 0),
  };
}

export interface OrderListFilters {
  search?: string;
  status?: OrderStatus | "all";
  payment_status?: PaymentStatus | "all";
  fulfillment_status?: FulfillmentStatus | "all";
  source?: OrderSource | "all";
  customer_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface OrderListResult {
  orders: Order[];
  total: number;
  page: number;
  page_size: number;
}

export async function listOrders(filters: OrderListFilters = {}): Promise<OrderListResult> {
  const empty: OrderListResult = { orders: [], total: 0, page: 1, page_size: filters.page_size ?? 20 };
  if (!isDatabaseConfigured) return empty;
  await ensureDatabase();
  const pool = getPool();
  const where: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (filters.search) {
    where.push(`(o.code ilike $${i} or o.customer_name ilike $${i} or o.customer_phone ilike $${i})`);
    params.push(`%${filters.search}%`);
    i++;
  }
  if (filters.status && filters.status !== "all") {
    where.push(`o.status = $${i++}`);
    params.push(filters.status);
  }
  if (filters.payment_status && filters.payment_status !== "all") {
    where.push(`o.payment_status = $${i++}`);
    params.push(filters.payment_status);
  }
  if (filters.fulfillment_status && filters.fulfillment_status !== "all") {
    where.push(`o.fulfillment_status = $${i++}`);
    params.push(filters.fulfillment_status);
  }
  if (filters.source && filters.source !== "all") {
    where.push(`o.source = $${i++}`);
    params.push(filters.source);
  }
  if (filters.customer_id) {
    where.push(`o.customer_id = $${i++}`);
    params.push(filters.customer_id);
  }
  if (filters.date_from) {
    where.push(`o.created_at >= $${i++}`);
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    where.push(`o.created_at <= $${i++}`);
    params.push(filters.date_to);
  }

  const whereSql = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.page_size ?? 20));
  const offset = (page - 1) * pageSize;

  const [countRes, dataRes] = await Promise.all([
    pool.query(`select count(*)::int as cnt from orders o ${whereSql}`, params),
    pool.query(
      `select o.* from orders o ${whereSql} order by o.created_at desc limit ${pageSize} offset ${offset}`,
      params
    ),
  ]);

  const orders: Order[] = dataRes.rows.map((r) => rowToOrder(r));
  if (orders.length > 0) {
    const ids = orders.map((o) => o.id);
    const itemsRes = await pool.query(
      `select * from order_items where order_id = any($1) order by position asc, created_at asc`,
      [ids]
    );
    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const it of itemsRes.rows) {
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push(rowToItem(it));
      itemsByOrder.set(it.order_id, arr);
    }
    for (const o of orders) {
      o.items = itemsByOrder.get(o.id) ?? [];
    }
  }

  return {
    orders,
    total: countRes.rows[0]?.cnt ?? 0,
    page,
    page_size: pageSize,
  };
}

export async function getOrder(id: string): Promise<Order | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const pool = getPool();
  const [orderRes, itemsRes] = await Promise.all([
    pool.query(`select * from orders where id = $1`, [id]),
    pool.query(`select * from order_items where order_id = $1 order by position asc, created_at asc`, [id]),
  ]);
  if (orderRes.rows.length === 0) return null;
  return rowToOrder(orderRes.rows[0], itemsRes.rows.map(rowToItem));
}

export async function createOrder(input: OrderInput): Promise<Order> {
  if (!isDatabaseConfigured) {
    throw new Error("Database is required to create orders.");
  }
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const code = await generateOrderCode();
    const subtotal = (input.items ?? []).reduce((s, it) => s + it.quantity * it.unit_price, 0);
    const itemDiscountTotal = (input.items ?? []).reduce(
      (s, it) => s + lineItemDiscountAmount(it.quantity, it.unit_price, it.discount_type ?? "amount", it.discount_value ?? 0),
      0
    );
    const discountType: DiscountType = input.discount_type ?? "amount";
    const discount = input.discount ?? 0;
    const shippingFee = input.shipping_fee ?? 0;
    const discountBase = Math.max(0, subtotal - itemDiscountTotal);
    const discountAmount = orderDiscountAmount(discountBase, discountType, discount);
    const total = Math.max(0, discountBase - discountAmount + shippingFee);
    const paid = input.paid ?? 0;

    const paymentStatus: PaymentStatus =
      input.payment_status ?? (paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "unpaid");

    const orderRes = await client.query(
      `insert into orders (
        code, customer_id, customer_name, customer_phone,
        status, payment_status, fulfillment_status, payment_method,
        source, branch, staff, note,
        subtotal, discount, discount_type, shipping_fee, total, paid,
        created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now(),now())
      returning *`,
      [
        code,
        input.customer_id ?? null,
        input.customer_name ?? "Khách lẻ",
        input.customer_phone ?? "",
        input.status ?? "new",
        paymentStatus,
        input.fulfillment_status ?? "unshipped",
        input.payment_method ?? "cod",
        input.source ?? "store",
        input.branch ?? "Chi nhánh chính",
        input.staff ?? "",
        input.note ?? "",
        subtotal,
        discount,
        discountType,
        shippingFee,
        total,
        paid,
      ]
    );
    const order = orderRes.rows[0];

    const items: OrderItem[] = [];
    let pos = 1;
    for (const it of input.items ?? []) {
      const discountType = it.discount_type ?? "amount";
      const discountValue = it.discount_value ?? 0;
      const lineTotal = lineItemTotal(it.quantity, it.unit_price, discountType, discountValue);
      const itemRes = await client.query(
        `insert into order_items (
          order_id, product_id, product_name, product_sku, unit, image_url,
          quantity, unit_price, discount_type, discount_value, line_total, position, created_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
        returning *`,
        [
          order.id,
          it.product_id,
          it.product_name,
          it.product_sku ?? "",
          it.unit ?? "",
          it.image_url ?? "",
          it.quantity,
          it.unit_price,
          discountType,
          discountValue,
          lineTotal,
          pos++,
        ]
      );
      items.push(rowToItem(itemRes.rows[0]));
    }

    // Trừ tồn kho ngay nếu đơn được tạo với status "completed" (nút "Thanh
    // toán (F10)" ở trang tạo đơn) — mirror transitionGoodsReceiptStatus.
    if (order.status === "completed") {
      const ctx: OrderStockContext = {
        orderId: order.id,
        code,
        customerName: order.customer_name,
        staff: order.staff,
        branch: order.branch,
      };
      for (const it of items) {
        if (!it.product_id || it.quantity <= 0) continue;
        await deductStockForItem(client, it.product_id, it.quantity, `(Đơn ${code})`, ctx);
        await client.query(`update order_items set stock_deducted_at = now() where id = $1`, [it.id]);
      }
    }

    // Update customer stats
    // Trước khi cộng stats, verify customer tồn tại — nếu id không match, UPDATE
    // silently no-op và stats sẽ bị lệch (mỗi đơn sẽ "tăng" total của 1 customer ảo).
    if (order.customer_id) {
      const customerRes = await client.query(
        `select id from customers where id = $1::uuid limit 1`,
        [order.customer_id]
      );
      if (customerRes.rows.length > 0) {
        await client.query(
          `update customers set
            total_orders = coalesce(total_orders, 0) + 1,
            total_spent = coalesce(total_spent, 0) + $2,
            last_order_at = now(),
            updated_at = now()
           where id = $1::uuid`,
          [order.customer_id, total]
        );
      } else {
        console.warn(`[createOrder] customer_id=${order.customer_id} không tồn tại, bỏ qua cập nhật stats`);
      }
    }

    await client.query("commit");
    await logActivity("order", `Tạo đơn hàng ${code} - ${order.customer_name} - ${total.toLocaleString("vi-VN")}đ`);

    const orderPayload = {
      order: {
        id: order.id,
        code: order.code,
        total,
        paid,
        source: order.source,
        staff: order.staff,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
      },
    };
    fireAutomation("order.created", orderPayload);
    if (paymentStatus === "paid") fireAutomation("order.paid", orderPayload);

    return rowToOrder(order, items);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateOrder(id: string, input: OrderInput): Promise<Order | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const existingRes = await client.query(`select * from orders where id = $1`, [id]);
    if (existingRes.rows.length === 0) {
      await client.query("rollback");
      return null;
    }
    const existing = existingRes.rows[0];
    const wasCompleted = existing.status === "completed";
    const resultStatus: OrderStatus = input.status ?? existing.status;

    // Đơn đang "completed" đã được trừ tồn trước đó → hoàn lại toàn bộ theo
    // số lượng hiện có trước khi áp thay đổi (item mới/status mới). Nếu sau
    // đó vẫn "completed", sẽ trừ lại đúng số lượng mới ở cuối hàm — tránh
    // cộng dồn/lệch khi user chỉnh số lượng của 1 đơn đã hoàn tất.
    const existingItemsRes = await client.query(
      `select id, product_id, quantity, unit_price, line_total from order_items where order_id = $1`,
      [id]
    );
    const existingItems = existingItemsRes.rows as Array<{
      id: string;
      product_id: string | null;
      quantity: number;
      unit_price: number;
      line_total: number;
    }>;
    const stockCtx: OrderStockContext = {
      orderId: id,
      code: existing.code,
      customerName: input.customer_name ?? existing.customer_name,
      staff: input.staff ?? existing.staff,
      branch: input.branch ?? existing.branch,
    };
    if (wasCompleted) {
      for (const it of existingItems) {
        if (!it.product_id || Number(it.quantity) <= 0) continue;
        await restoreStockForItem(client, it.product_id, Number(it.quantity), `(sửa đơn ${existing.code})`, stockCtx);
      }
    }

    // Không dùng `(input.items ?? []).reduce(...)` — khi input.items không
    // truyền (chỉ đổi status/payment...), subtotal phải giữ nguyên giá trị cũ
    // thay vì bị reset về 0 (bug cũ: PATCH chỉ đổi status qua updateOrder sẽ
    // xoá sạch subtotal/total của đơn).
    const subtotal = input.items
      ? input.items.reduce((s, it) => s + it.quantity * it.unit_price, 0)
      : Number(existing.subtotal);
    const itemDiscountTotal = input.items
      ? input.items.reduce(
          (s, it) => s + lineItemDiscountAmount(it.quantity, it.unit_price, it.discount_type ?? "amount", it.discount_value ?? 0),
          0
        )
      : existingItems.reduce((s, it) => s + (Number(it.quantity) * Number(it.unit_price) - Number(it.line_total)), 0);
    const discountType: DiscountType = input.discount_type ?? (existing.discount_type === "percent" ? "percent" : "amount");
    const discount = input.discount ?? Number(existing.discount);
    const shippingFee = input.shipping_fee ?? Number(existing.shipping_fee);
    const discountBase = Math.max(0, subtotal - itemDiscountTotal);
    const discountAmount = orderDiscountAmount(discountBase, discountType, discount);
    const total = Math.max(0, discountBase - discountAmount + shippingFee);
    const paid = input.paid ?? Number(existing.paid);
    const paymentStatus: PaymentStatus =
      input.payment_status ?? (paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "unpaid");

    await client.query(
      `update orders set
        customer_id = $2,
        customer_name = $3,
        customer_phone = $4,
        status = $5,
        payment_status = $6,
        fulfillment_status = $7,
        payment_method = $8,
        source = $9,
        branch = $10,
        staff = $11,
        note = $12,
        subtotal = $13,
        discount = $14,
        discount_type = $15,
        shipping_fee = $16,
        total = $17,
        paid = $18,
        updated_at = now()
       where id = $1`,
      [
        id,
        input.customer_id ?? existing.customer_id,
        input.customer_name ?? existing.customer_name,
        input.customer_phone ?? existing.customer_phone,
        input.status ?? existing.status,
        paymentStatus,
        input.fulfillment_status ?? existing.fulfillment_status,
        input.payment_method ?? existing.payment_method,
        input.source ?? existing.source,
        input.branch ?? existing.branch,
        input.staff ?? existing.staff,
        input.note ?? existing.note,
        subtotal,
        discount,
        discountType,
        shippingFee,
        total,
        paid,
      ]
    );

    let finalItems: Array<{ id: string; product_id: string | null; quantity: number }> = existingItems;
    if (input.items) {
      await client.query(`delete from order_items where order_id = $1`, [id]);
      const inserted: Array<{ id: string; product_id: string | null; quantity: number }> = [];
      let pos = 1;
      for (const it of input.items) {
        const discountType = it.discount_type ?? "amount";
        const discountValue = it.discount_value ?? 0;
        const lineTotal = lineItemTotal(it.quantity, it.unit_price, discountType, discountValue);
        const itemRes = await client.query(
          `insert into order_items (
            order_id, product_id, product_name, product_sku, unit, image_url,
            quantity, unit_price, discount_type, discount_value, line_total, position, created_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
          returning id, product_id, quantity`,
          [
            id,
            it.product_id,
            it.product_name,
            it.product_sku ?? "",
            it.unit ?? "",
            it.image_url ?? "",
            it.quantity,
            it.unit_price,
            discountType,
            discountValue,
            lineTotal,
            pos++,
          ]
        );
        inserted.push(itemRes.rows[0]);
      }
      finalItems = inserted;
    }

    if (resultStatus === "completed") {
      for (const it of finalItems) {
        if (!it.product_id || Number(it.quantity) <= 0) continue;
        await deductStockForItem(client, it.product_id, Number(it.quantity), `(sửa đơn ${existing.code})`, stockCtx);
        await client.query(`update order_items set stock_deducted_at = now() where id = $1`, [it.id]);
      }
    } else if (wasCompleted && !input.items) {
      // Rời khỏi "completed" mà không thay item — đã hoàn tồn ở trên, reset
      // marker để nếu sau này quay lại "completed" sẽ trừ lại đúng cách.
      await client.query(`update order_items set stock_deducted_at = NULL where order_id = $1`, [id]);
    }

    await client.query("commit");
    await logActivity("order", `Cập nhật đơn hàng ${existing.code}`);

    if (paymentStatus === "paid" && existing.payment_status !== "paid") {
      fireAutomation("order.paid", {
        order: {
          id,
          code: existing.code,
          total,
          paid,
          customer_name: input.customer_name ?? existing.customer_name,
          customer_phone: input.customer_phone ?? existing.customer_phone,
        },
      });
    }

    return await getOrder(id);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Chuyển trạng thái đơn hàng, kèm trừ/hoàn tồn kho khi đi vào/ra khỏi
 * "completed" — mirror transitionGoodsReceiptStatus (lib/inventory/receipts.ts).
 * Idempotent theo order_items.stock_deducted_at (bỏ qua item đã trừ khi trừ
 * lại, chỉ hoàn item đã trừ khi rollback).
 */
export async function transitionOrderStatus(input: {
  orderId: string;
  nextStatus: OrderStatus;
}): Promise<{ success: boolean; message: string }> {
  if (!isDatabaseConfigured) return { success: false, message: "Database chưa cấu hình." };
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const orderRes = await client.query(
      `select id, code, status, customer_name, staff, branch from orders where id = $1`,
      [input.orderId]
    );
    if (orderRes.rows.length === 0) {
      await client.query("rollback");
      return { success: false, message: "Không tìm thấy đơn hàng." };
    }
    const order = orderRes.rows[0];
    const cur: OrderStatus = order.status;
    const next = input.nextStatus;
    const ctx: OrderStockContext = {
      orderId: order.id,
      code: order.code,
      customerName: order.customer_name,
      staff: order.staff,
      branch: order.branch,
    };

    if (cur !== next) {
      if (next === "completed") {
        const itemsRes = await client.query(
          `select id, product_id, quantity, stock_deducted_at from order_items where order_id = $1`,
          [input.orderId]
        );
        for (const it of itemsRes.rows) {
          if (it.stock_deducted_at) continue;
          if (!it.product_id || Number(it.quantity) <= 0) continue;
          await deductStockForItem(client, it.product_id, Number(it.quantity), `(Đơn ${order.code})`, ctx);
          await client.query(`update order_items set stock_deducted_at = now() where id = $1`, [it.id]);
        }
      } else if (cur === "completed") {
        const itemsRes = await client.query(
          `select id, product_id, quantity
             from order_items where order_id = $1 and stock_deducted_at is not null`,
          [input.orderId]
        );
        for (const it of itemsRes.rows) {
          if (!it.product_id || Number(it.quantity) <= 0) continue;
          await restoreStockForItem(client, it.product_id, Number(it.quantity), `(rollback đơn ${order.code})`, ctx);
          await client.query(`update order_items set stock_deducted_at = NULL where id = $1`, [it.id]);
        }
      }
    }

    await client.query(`update orders set status = $2, updated_at = now() where id = $1`, [input.orderId, next]);
    await client.query("commit");
    await logActivity("order", `Cập nhật trạng thái đơn hàng ${order.code} → ${next}`);
    return { success: true, message: `Đã cập nhật trạng thái sang "${next}".` };
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    return { success: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  } finally {
    client.release();
  }
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<boolean> {
  const result = await transitionOrderStatus({ orderId: id, nextStatus: status });
  return result.success;
}

// Các bước kế tiếp hợp lệ cho từng trạng thái xử lý đơn — dùng cho nút bấm
// "chuyển bước tiếp theo" ở trang chi tiết đơn hàng. "returned" chỉ cho phép
// từ "shipping"/"shipped" (hàng đã ra khỏi kho/đang hoặc đã tới tay khách rồi
// mới có khái niệm "hoàn"), không cho phép quay lại từ "returned".
const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  unshipped: ["confirmed"],
  confirmed: ["packing"],
  packing: ["shipping"],
  shipping: ["shipped", "returned"],
  shipped: ["returned"],
  returned: [],
};

/**
 * Chuyển bước xử lý đơn (unshipped→confirmed→packing→shipping→shipped),
 * dùng cho đơn KHÔNG có vận đơn liên kết ở module Shipping (ví dụ đơn website
 * tự giao, không qua đối tác vận chuyển) — xem STOREFRONT_PLAN.md mục 6.
 * Nếu đơn có `shippings` liên kết, nên cập nhật trạng thái ở module Shipping
 * (tự đồng bộ ngược qua `syncOrderFulfillmentStatus`) thay vì gọi hàm này để
 * tránh 2 nơi cùng ghi đè `orders.fulfillment_status`.
 *
 * COD: khi đạt "shipped", tự chuyển payment_status → "paid" (thu tiền lúc
 * giao xong). bank_transfer/card: không tự đổi payment_status — khách đã trả
 * trước hoặc nhân viên xác nhận thủ công độc lập với bước giao hàng.
 */
export async function transitionFulfillmentStatus(input: {
  orderId: string;
  nextStatus: FulfillmentStatus;
}): Promise<{ success: boolean; message: string }> {
  if (!isDatabaseConfigured) return { success: false, message: "Database chưa cấu hình." };
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const orderRes = await client.query(
      `select id, code, fulfillment_status, payment_status, payment_method, customer_name, customer_phone, total
         from orders where id = $1`,
      [input.orderId]
    );
    if (orderRes.rows.length === 0) {
      await client.query("rollback");
      return { success: false, message: "Không tìm thấy đơn hàng." };
    }
    const order = orderRes.rows[0];
    const cur: FulfillmentStatus = order.fulfillment_status;
    const next = input.nextStatus;

    if (cur === next) {
      await client.query("rollback");
      return { success: true, message: `Đơn đang ở trạng thái "${next}".` };
    }
    if (!FULFILLMENT_TRANSITIONS[cur]?.includes(next)) {
      await client.query("rollback");
      return { success: false, message: `Không thể chuyển từ "${cur}" sang "${next}".` };
    }

    const autoPaid = next === "shipped" && order.payment_method === "cod" && order.payment_status !== "paid";
    if (autoPaid) {
      await client.query(
        `update orders set fulfillment_status = $2, payment_status = 'paid', paid = total, updated_at = now() where id = $1`,
        [input.orderId, next]
      );
    } else {
      await client.query(`update orders set fulfillment_status = $2, updated_at = now() where id = $1`, [
        input.orderId,
        next,
      ]);
    }

    await client.query("commit");
    await logActivity("order", `Cập nhật xử lý đơn hàng ${order.code} → ${next}${autoPaid ? " (COD đã thu tiền)" : ""}`);

    const payload = {
      order: {
        id: order.id,
        code: order.code,
        total: Number(order.total),
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
      },
    };
    if (next === "shipped") fireAutomation("order.shipped", payload);
    if (next === "returned") fireAutomation("shipping.returned", payload);
    if (autoPaid) fireAutomation("order.paid", { order: { ...payload.order, paid: Number(order.total) } });

    return { success: true, message: `Đã chuyển sang "${next}".` };
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    return { success: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  } finally {
    client.release();
  }
}

/**
 * "Xác nhận đơn" — dùng cho đơn `status='new'` (điển hình: đơn khách đặt trên
 * website, chưa qua ai duyệt). Gộp 2 việc vào 1 transaction: (a) chuyển
 * OrderStatus → "completed" để trừ tồn kho (mirror transitionOrderStatus),
 * (b) chuyển FulfillmentStatus "unshipped" → "confirmed" để bắt đầu pipeline
 * xử lý giao hàng. Không dùng 2 hàm transitionOrderStatus/transitionFulfillmentStatus
 * riêng lẻ ở đây vì mỗi hàm tự mở/commit transaction riêng — làm gộp để đảm
 * bảo tính atomic (trừ kho và bắt đầu xử lý đơn phải cùng thành công hoặc
 * cùng rollback).
 */
export async function confirmOrder(orderId: string): Promise<{ success: boolean; message: string }> {
  if (!isDatabaseConfigured) return { success: false, message: "Database chưa cấu hình." };
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const orderRes = await client.query(
      `select id, code, status, fulfillment_status, customer_name, staff, branch from orders where id = $1`,
      [orderId]
    );
    if (orderRes.rows.length === 0) {
      await client.query("rollback");
      return { success: false, message: "Không tìm thấy đơn hàng." };
    }
    const order = orderRes.rows[0];
    if (order.status !== "new") {
      await client.query("rollback");
      return { success: false, message: `Chỉ xác nhận được đơn ở trạng thái "new" (đơn đang ở "${order.status}").` };
    }
    if (order.fulfillment_status !== "unshipped") {
      await client.query("rollback");
      return { success: false, message: `Đơn đã qua bước xử lý (đang ở "${order.fulfillment_status}").` };
    }

    const ctx: OrderStockContext = {
      orderId: order.id,
      code: order.code,
      customerName: order.customer_name,
      staff: order.staff,
      branch: order.branch,
    };
    const itemsRes = await client.query(
      `select id, product_id, quantity, stock_deducted_at from order_items where order_id = $1`,
      [orderId]
    );
    for (const it of itemsRes.rows) {
      if (it.stock_deducted_at) continue;
      if (!it.product_id || Number(it.quantity) <= 0) continue;
      await deductStockForItem(client, it.product_id, Number(it.quantity), `(Đơn ${order.code})`, ctx);
      await client.query(`update order_items set stock_deducted_at = now() where id = $1`, [it.id]);
    }

    await client.query(
      `update orders set status = 'completed', fulfillment_status = 'confirmed', updated_at = now() where id = $1`,
      [orderId]
    );

    await client.query("commit");
    await logActivity("order", `Xác nhận đơn hàng ${order.code}`);
    return { success: true, message: "Đã xác nhận đơn hàng." };
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    return { success: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  } finally {
    client.release();
  }
}

export async function deleteOrder(id: string): Promise<boolean> {
  if (!isDatabaseConfigured) return false;
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Lấy customer_id + total + status TRƯỚC khi xóa để hoàn lại stats/tồn kho.
    const before = await client.query(
      `select customer_id, total, status, code, customer_name, staff, branch from orders where id = $1::uuid limit 1`,
      [id]
    );
    if (before.rows.length === 0) {
      await client.query("rollback");
      return false;
    }
    const { customer_id, total, status, code, customer_name, staff, branch } = before.rows[0];

    if (status === "completed") {
      const itemsRes = await client.query(
        `select product_id, quantity from order_items where order_id = $1 and stock_deducted_at is not null`,
        [id]
      );
      const ctx: OrderStockContext = { orderId: id, code, customerName: customer_name, staff, branch };
      for (const it of itemsRes.rows) {
        if (!it.product_id || Number(it.quantity) <= 0) continue;
        await restoreStockForItem(client, it.product_id, Number(it.quantity), `(xoá đơn ${id})`, ctx);
      }
    }

    const res = await client.query(`delete from orders where id = $1::uuid`, [id]);
    if ((res.rowCount ?? 0) > 0 && customer_id) {
      await client
        .query(
          `update customers set
             total_orders = greatest(coalesce(total_orders, 0) - 1, 0),
             total_spent  = greatest(coalesce(total_spent, 0) - $2, 0),
             updated_at   = now()
           where id = $1::uuid`,
          [customer_id, Number(total ?? 0)]
        )
        .catch((err) => {
          console.warn(`[deleteOrder] rollback customer stats failed:`, err);
        });
    }
    await client.query("commit");
    if ((res.rowCount ?? 0) > 0) {
      await logActivity("order", `Xoá đơn hàng ${id}`);
    }
    return (res.rowCount ?? 0) > 0;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
