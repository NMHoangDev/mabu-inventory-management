import { ensureDatabase } from "../db/migration";
import { getPool, isDatabaseConfigured, logActivity } from "../db/connection";

export type OrderStatus = "new" | "processing" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded";
export type FulfillmentStatus = "unshipped" | "shipping" | "shipped" | "returned";
export type OrderSource = "store" | "facebook" | "website" | "zalo" | "other";

export interface OrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string;
  unit: string;
  image_url: string;
  quantity: number;
  unit_price: number;
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
  source: OrderSource;
  branch: string;
  staff: string;
  note: string;
  subtotal: number;
  discount: number;
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
}

export interface OrderInput {
  customer_id?: string | null;
  customer_name?: string;
  customer_phone?: string;
  status?: OrderStatus;
  payment_status?: PaymentStatus;
  fulfillment_status?: FulfillmentStatus;
  source?: OrderSource;
  branch?: string;
  staff?: string;
  note?: string;
  discount?: number;
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
    source: row.source,
    branch: row.branch,
    staff: row.staff,
    note: row.note,
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
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
    line_total: Number(row.line_total ?? 0),
  };
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
    pool.query(`select count(*)::int as c from orders where fulfillment_status in ('unshipped', 'shipping') and status != 'cancelled'`),
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
    const discount = input.discount ?? 0;
    const shippingFee = input.shipping_fee ?? 0;
    const total = Math.max(0, subtotal - discount + shippingFee);
    const paid = input.paid ?? 0;

    const paymentStatus: PaymentStatus =
      input.payment_status ?? (paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "unpaid");

    const orderRes = await client.query(
      `insert into orders (
        code, customer_id, customer_name, customer_phone,
        status, payment_status, fulfillment_status,
        source, branch, staff, note,
        subtotal, discount, shipping_fee, total, paid,
        created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now())
      returning *`,
      [
        code,
        input.customer_id ?? null,
        input.customer_name ?? "Khách lẻ",
        input.customer_phone ?? "",
        input.status ?? "new",
        paymentStatus,
        input.fulfillment_status ?? "unshipped",
        input.source ?? "store",
        input.branch ?? "Chi nhánh chính",
        input.staff ?? "",
        input.note ?? "",
        subtotal,
        discount,
        shippingFee,
        total,
        paid,
      ]
    );
    const order = orderRes.rows[0];

    const items: OrderItem[] = [];
    let pos = 1;
    for (const it of input.items ?? []) {
      const lineTotal = it.quantity * it.unit_price;
      const itemRes = await client.query(
        `insert into order_items (
          order_id, product_id, product_name, product_sku, unit, image_url,
          quantity, unit_price, line_total, position, created_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
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
          lineTotal,
          pos++,
        ]
      );
      items.push(rowToItem(itemRes.rows[0]));
    }

    // Update customer stats
    if (order.customer_id) {
      await client.query(
        `update customers set
          total_orders = coalesce(total_orders, 0) + 1,
          total_spent = coalesce(total_spent, 0) + $2,
          last_order_at = now(),
          updated_at = now()
         where id = $1`,
        [order.customer_id, total]
      );
    }

    await client.query("commit");
    await logActivity("order", `Tạo đơn hàng ${code} - ${order.customer_name} - ${total.toLocaleString("vi-VN")}đ`);
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

    const subtotal = (input.items ?? []).reduce((s, it) => s + it.quantity * it.unit_price, 0);
    const discount = input.discount ?? Number(existing.discount);
    const shippingFee = input.shipping_fee ?? Number(existing.shipping_fee);
    const total = Math.max(0, subtotal - discount + shippingFee);
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
        source = $8,
        branch = $9,
        staff = $10,
        note = $11,
        subtotal = $12,
        discount = $13,
        shipping_fee = $14,
        total = $15,
        paid = $16,
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
        input.source ?? existing.source,
        input.branch ?? existing.branch,
        input.staff ?? existing.staff,
        input.note ?? existing.note,
        subtotal,
        discount,
        shippingFee,
        total,
        paid,
      ]
    );

    if (input.items) {
      await client.query(`delete from order_items where order_id = $1`, [id]);
      let pos = 1;
      for (const it of input.items) {
        const lineTotal = it.quantity * it.unit_price;
        await client.query(
          `insert into order_items (
            order_id, product_id, product_name, product_sku, unit, image_url,
            quantity, unit_price, line_total, position, created_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`,
          [
            id,
            it.product_id,
            it.product_name,
            it.product_sku ?? "",
            it.unit ?? "",
            it.image_url ?? "",
            it.quantity,
            it.unit_price,
            lineTotal,
            pos++,
          ]
        );
      }
    }

    await client.query("commit");
    await logActivity("order", `Cập nhật đơn hàng ${existing.code}`);
    return await getOrder(id);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<boolean> {
  if (!isDatabaseConfigured) return false;
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(
    `update orders set status = $2, updated_at = now() where id = $1`,
    [id, status]
  );
  if ((res.rowCount ?? 0) > 0) {
    await logActivity("order", `Cập nhật trạng thái đơn hàng ${id} → ${status}`);
    return true;
  }
  return false;
}

export async function deleteOrder(id: string): Promise<boolean> {
  if (!isDatabaseConfigured) return false;
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(`delete from orders where id = $1`, [id]);
  if ((res.rowCount ?? 0) > 0) {
    await logActivity("order", `Xoá đơn hàng ${id}`);
  }
  return (res.rowCount ?? 0) > 0;
}
