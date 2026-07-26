import { isDatabaseConfigured, getPool, logActivity } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { applyInventoryLevelDelta } from "../inventory/receipts";
import { recordStockMovement } from "../inventory/stock-movements";
import { getNextCashBookCode } from "../cash-book/repository";

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

export interface OrderReturnItem {
  id: string;
  order_item_id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string;
  quantity_returned: number;
  unit_price: number;
  line_refund_amount: number;
  restocked: boolean;
}

export interface OrderReturn {
  id: string;
  code: string;
  order_id: string;
  order_code: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  reason: string;
  refund_amount: number;
  status: "completed" | "cancelled";
  cash_book_id: string | null;
  branch: string;
  created_by: string;
  items: OrderReturnItem[];
  created_at: string;
  updated_at: string;
}

export interface ReturnableOrderRow {
  id: string;
  code: string;
  created_at: string;
  staff: string;
  customer_name: string;
  customer_phone: string;
  total: number;
}

export interface ReturnableOrderItemRow {
  order_item_id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string;
  unit: string;
  quantity: number;
  unit_price: number;
  already_returned: number;
  returnable_qty: number;
}

function rowToReturnItem(row: any): OrderReturnItem {
  return {
    id: row.id,
    order_item_id: row.order_item_id,
    product_id: row.product_id,
    product_name: str(row.product_name),
    product_sku: str(row.product_sku),
    quantity_returned: num(row.quantity_returned),
    unit_price: num(row.unit_price),
    line_refund_amount: num(row.line_refund_amount),
    restocked: !!row.restocked,
  };
}

function rowToReturn(row: any, items: OrderReturnItem[] = []): OrderReturn {
  return {
    id: row.id,
    code: str(row.code),
    order_id: row.order_id,
    order_code: str(row.order_code),
    customer_id: row.customer_id,
    customer_name: str(row.customer_name),
    customer_phone: str(row.customer_phone),
    reason: str(row.reason),
    refund_amount: num(row.refund_amount),
    status: (row.status ?? "completed") as OrderReturn["status"],
    cash_book_id: row.cash_book_id,
    branch: str(row.branch, "Chi nhánh mặc định"),
    created_by: str(row.created_by),
    items,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function generateReturnCode(pool: ReturnType<typeof getPool>): Promise<string> {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const prefix = `TH${yyyy}${mm}${dd}`;
  const res = await pool.query(`select count(*)::int as cnt from order_returns where code like $1`, [`${prefix}%`]);
  const next = String((res.rows[0]?.cnt ?? 0) + 1).padStart(3, "0");
  return `${prefix}${next}`;
}

// ─── Danh sách đơn đủ điều kiện trả (màn "Chọn đơn hàng để trả") ──────────
// Chỉ đơn: status='completed' (đã xác nhận, đã trừ kho) VÀ còn ít nhất 1 dòng
// quantity > tổng đã trả (đơn đã trả hết mọi dòng thì ẩn khỏi picker này —
// vẫn xem được qua listOrderReturns).
export interface ReturnableOrderFilters {
  search?: string;
  page?: number;
  page_size?: number;
}

export async function listReturnableOrders(
  filters: ReturnableOrderFilters = {}
): Promise<{ orders: ReturnableOrderRow[]; total: number; page: number; page_size: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.page_size ?? 20));
  const empty = { orders: [], total: 0, page, page_size: pageSize };
  if (!isDatabaseConfigured) return empty;
  await ensureDatabase();
  const pool = getPool();

  const where: string[] = [
    `o.status = 'completed'`,
    `exists (select 1 from order_items oi where oi.order_id = o.id and oi.stock_deducted_at is not null)`,
    `exists (
       select 1 from order_items oi
       left join (
         select order_item_id, coalesce(sum(quantity_returned), 0) as returned
         from order_return_items group by order_item_id
       ) ret on ret.order_item_id = oi.id
       where oi.order_id = o.id and oi.quantity > coalesce(ret.returned, 0)
     )`,
  ];
  const params: any[] = [];
  let i = 1;
  const q = filters.search?.trim();
  if (q) {
    where.push(`(o.code ilike $${i} or o.customer_name ilike $${i} or o.customer_phone ilike $${i})`);
    params.push(`%${q}%`);
    i++;
  }
  const whereSql = `where ${where.join(" and ")}`;
  const offset = (page - 1) * pageSize;

  const [countRes, dataRes] = await Promise.all([
    pool.query(`select count(*)::int as cnt from orders o ${whereSql}`, params),
    pool.query(
      `select o.id, o.code, o.created_at, o.staff, o.customer_name, o.customer_phone, o.total
         from orders o ${whereSql}
        order by o.created_at desc
        limit $${i} offset $${i + 1}`,
      [...params, pageSize, offset]
    ),
  ]);

  return {
    orders: dataRes.rows.map((r) => ({
      id: r.id,
      code: str(r.code),
      created_at: r.created_at,
      staff: str(r.staff),
      customer_name: str(r.customer_name),
      customer_phone: str(r.customer_phone),
      total: num(r.total),
    })),
    total: num(countRes.rows[0]?.cnt),
    page,
    page_size: pageSize,
  };
}

// ─── Chi tiết đơn + SL còn có thể trả từng dòng (màn tạo phiếu trả) ────────
export async function getReturnableOrderDetail(orderId: string): Promise<{
  order: { id: string; code: string; customer_name: string; customer_phone: string; staff: string; total: number; created_at: string };
  items: ReturnableOrderItemRow[];
} | null> {
  if (!isDatabaseConfigured || !isUuid(orderId)) return null;
  await ensureDatabase();
  const pool = getPool();

  const orderRes = await pool.query(
    `select id, code, customer_name, customer_phone, staff, total, created_at from orders where id = $1::uuid limit 1`,
    [orderId]
  );
  if (orderRes.rows.length === 0) return null;
  const o = orderRes.rows[0];

  const itemsRes = await pool.query(
    `select oi.id as order_item_id, oi.product_id, oi.product_name, oi.product_sku, oi.unit,
            oi.quantity, oi.unit_price, coalesce(ret.returned, 0) as already_returned
       from order_items oi
       left join (
         select order_item_id, sum(quantity_returned) as returned
         from order_return_items group by order_item_id
       ) ret on ret.order_item_id = oi.id
      where oi.order_id = $1::uuid
      order by oi.position asc, oi.created_at asc`,
    [orderId]
  );

  return {
    order: {
      id: o.id,
      code: str(o.code),
      customer_name: str(o.customer_name),
      customer_phone: str(o.customer_phone),
      staff: str(o.staff),
      total: num(o.total),
      created_at: o.created_at,
    },
    items: itemsRes.rows.map((r) => {
      const quantity = num(r.quantity);
      const alreadyReturned = num(r.already_returned);
      return {
        order_item_id: r.order_item_id,
        product_id: r.product_id,
        product_name: str(r.product_name),
        product_sku: str(r.product_sku),
        unit: str(r.unit),
        quantity,
        unit_price: num(r.unit_price),
        already_returned: alreadyReturned,
        returnable_qty: Math.max(0, quantity - alreadyReturned),
      };
    }),
  };
}

// ─── Tạo phiếu trả hàng — transaction chính ─────────────────────────────────
export interface CreateOrderReturnInput {
  order_id: string;
  reason?: string;
  branch?: string;
  created_by?: string;
  items: { order_item_id: string; quantity_returned: number }[];
}

export async function createOrderReturn(input: CreateOrderReturnInput): Promise<OrderReturn> {
  if (!isDatabaseConfigured) throw new Error("Database chưa được cấu hình.");
  if (!isUuid(input.order_id)) throw new Error("Đơn hàng không hợp lệ.");
  if (!input.items || input.items.length === 0) throw new Error("Chưa chọn sản phẩm nào để trả.");

  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const orderRes = await client.query(`select * from orders where id = $1::uuid for update`, [input.order_id]);
    if (orderRes.rows.length === 0) throw new Error("Không tìm thấy đơn hàng.");
    const order = orderRes.rows[0];
    if (order.status !== "completed") {
      throw new Error("Chỉ có thể trả hàng cho đơn đã hoàn tất.");
    }

    // Re-check returnable qty NGAY TRONG transaction (chống race giữa lúc mở
    // form và lúc bấm lưu) — validate xong mới ghi, sai thì rollback toàn bộ,
    // không tự động clamp âm thầm.
    const lines: {
      order_item_id: string;
      product_id: string | null;
      product_name: string;
      product_sku: string;
      unit_price: number;
      quantity_returned: number;
      line_refund_amount: number;
    }[] = [];

    for (const reqItem of input.items) {
      if (!isUuid(reqItem.order_item_id)) throw new Error("Dòng sản phẩm không hợp lệ.");
      if (!Number.isInteger(reqItem.quantity_returned) || reqItem.quantity_returned <= 0) {
        throw new Error("Số lượng trả phải là số nguyên lớn hơn 0.");
      }

      const itemRes = await client.query(
        `select oi.*, coalesce(ret.returned, 0) as already_returned
           from order_items oi
           left join (
             select order_item_id, sum(quantity_returned) as returned
             from order_return_items where order_item_id = $1::uuid group by order_item_id
           ) ret on ret.order_item_id = oi.id
          where oi.id = $1::uuid and oi.order_id = $2::uuid
          for update of oi`,
        [reqItem.order_item_id, input.order_id]
      );
      if (itemRes.rows.length === 0) throw new Error("Không tìm thấy dòng sản phẩm trong đơn.");
      const item = itemRes.rows[0];
      const returnableQty = num(item.quantity) - num(item.already_returned);
      if (reqItem.quantity_returned > returnableQty) {
        throw new Error(
          `Số lượng trả (${reqItem.quantity_returned}) vượt quá số lượng có thể trả (${returnableQty}) của sản phẩm "${item.product_name}".`
        );
      }

      const unitPrice = num(item.unit_price);
      lines.push({
        order_item_id: item.id,
        product_id: item.product_id,
        product_name: str(item.product_name),
        product_sku: str(item.product_sku),
        unit_price: unitPrice,
        quantity_returned: reqItem.quantity_returned,
        line_refund_amount: Math.round(unitPrice * reqItem.quantity_returned * 100) / 100,
      });
    }

    const refundAmount = lines.reduce((s, l) => s + l.line_refund_amount, 0);
    const code = await generateReturnCode(pool);

    const returnRes = await client.query(
      `insert into order_returns (
         code, order_id, order_code, customer_id, customer_name, customer_phone,
         reason, refund_amount, status, branch, created_by, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9,$10, now(), now())
       returning *`,
      [
        code,
        input.order_id,
        str(order.code),
        order.customer_id,
        str(order.customer_name),
        str(order.customer_phone),
        str(input.reason),
        refundAmount,
        str(input.branch, order.branch ?? "Chi nhánh mặc định"),
        str(input.created_by),
      ]
    );
    const orderReturn = returnRes.rows[0];

    const insertedItems: OrderReturnItem[] = [];
    for (const line of lines) {
      const insRes = await client.query(
        `insert into order_return_items (
           order_return_id, order_item_id, product_id, product_name, product_sku,
           quantity_returned, unit_price, line_refund_amount, restocked, created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,true, now())
         returning *`,
        [
          orderReturn.id,
          line.order_item_id,
          line.product_id,
          line.product_name,
          line.product_sku,
          line.quantity_returned,
          line.unit_price,
          line.line_refund_amount,
        ]
      );
      insertedItems.push(rowToReturnItem(insRes.rows[0]));

      // Hoàn kho — dùng lại đúng cơ chế restoreStockForItem đang dùng khi huỷ
      // đơn (lib/orders/repository.ts), chỉ khác là referenceTable trỏ về
      // order_returns thay vì orders.
      if (line.product_id) {
        const stockRes = await client.query(
          `update products set stock = coalesce(stock, 0) + $2, stock_updated_at = now(), updated_at = now()
            where id = $1 returning stock`,
          [line.product_id, line.quantity_returned]
        );
        await applyInventoryLevelDelta(client, line.product_id, line.quantity_returned, "order_return");
        await recordStockMovement(client, {
          productId: line.product_id,
          movementType: "order_restore",
          quantityChange: line.quantity_returned,
          resultingStock: num(stockRes.rows[0]?.stock),
          referenceTable: "order_returns",
          referenceId: orderReturn.id,
          referenceCode: code,
          customerName: str(order.customer_name),
          staff: str(input.created_by),
          branch: str(input.branch, order.branch ?? "Chi nhánh mặc định"),
        });
      }
    }

    // Phiếu chi hoàn tiền ở Sổ quỹ — ghi trực tiếp trong CÙNG transaction
    // (không gọi createCashBookEntry() vì hàm đó tự mở pool.query riêng, không
    // atomic được với transaction này).
    const cashBookCode = await getNextCashBookCode("payment");
    const cashBookRes = await client.query(
      `insert into cash_book (
         code, voucher_type, payment_type, payment_category, person_name,
         reference_code, reference_type, payment_method, amount, branch,
         recorded_date, note, status, created_by, created_at, updated_at
       ) values ($1,'payment','refund','Trả hàng',$2,$3,'order_return','Tiền mặt',$4,$5, current_date, $6, 'completed', $7, now(), now())
       returning id`,
      [
        cashBookCode,
        str(order.customer_name),
        code,
        refundAmount,
        str(input.branch, order.branch ?? "Chi nhánh mặc định"),
        str(input.reason, `Hoàn tiền trả hàng cho đơn ${order.code}`),
        str(input.created_by),
      ]
    );
    const cashBookId = cashBookRes.rows[0].id;
    await client.query(`update order_returns set cash_book_id = $2, updated_at = now() where id = $1`, [
      orderReturn.id,
      cashBookId,
    ]);

    // Quy tắc đổi fulfillment_status: CHỈ chuyển 'returned' khi TOÀN BỘ dòng
    // của đơn đã trả hết (kể cả các phiếu trả trước đó cộng dồn) — trả 1 phần
    // thì GIỮ NGUYÊN trạng thái hiện tại, không đổi thành "returned" (tránh
    // làm sai nghĩa tab "Đơn hoàn trả" ở /orders, vốn đang hiểu 'returned' là
    // trả hết cả đơn).
    const remainingRes = await client.query(
      `select count(*)::int as cnt
         from order_items oi
         left join (
           select order_item_id, sum(quantity_returned) as returned
           from order_return_items group by order_item_id
         ) ret on ret.order_item_id = oi.id
        where oi.order_id = $1::uuid and oi.quantity > coalesce(ret.returned, 0)`,
      [input.order_id]
    );
    const fullyReturned = num(remainingRes.rows[0]?.cnt) === 0;
    if (fullyReturned) {
      await client.query(`update orders set fulfillment_status = 'returned', updated_at = now() where id = $1`, [
        input.order_id,
      ]);
    }

    await client.query("commit");
    await logActivity(
      "order_return",
      `Tạo phiếu trả hàng ${code} cho đơn ${order.code} - hoàn ${refundAmount.toLocaleString("vi-VN")}đ`
    );

    return rowToReturn({ ...orderReturn, cash_book_id: cashBookId }, insertedItems);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

// ─── Danh sách / chi tiết phiếu trả đã tạo ("Tất cả đơn trả hàng") ────────
export interface OrderReturnFilters {
  search?: string;
  page?: number;
  page_size?: number;
}

export async function listOrderReturns(
  filters: OrderReturnFilters = {}
): Promise<{ returns: OrderReturn[]; total: number; page: number; page_size: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.page_size ?? 20));
  const empty = { returns: [], total: 0, page, page_size: pageSize };
  if (!isDatabaseConfigured) return empty;
  await ensureDatabase();
  const pool = getPool();

  const where: string[] = [];
  const params: any[] = [];
  let i = 1;
  const q = filters.search?.trim();
  if (q) {
    where.push(`(r.code ilike $${i} or r.order_code ilike $${i} or r.customer_name ilike $${i})`);
    params.push(`%${q}%`);
    i++;
  }
  const whereSql = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const offset = (page - 1) * pageSize;

  const [countRes, dataRes] = await Promise.all([
    pool.query(`select count(*)::int as cnt from order_returns r ${whereSql}`, params),
    pool.query(
      `select r.* from order_returns r ${whereSql} order by r.created_at desc limit $${i} offset $${i + 1}`,
      [...params, pageSize, offset]
    ),
  ]);

  const returns = dataRes.rows.map((r) => rowToReturn(r));
  if (returns.length > 0) {
    const ids = returns.map((r) => r.id);
    const itemsRes = await pool.query(`select * from order_return_items where order_return_id = any($1)`, [ids]);
    const byReturn = new Map<string, OrderReturnItem[]>();
    for (const row of itemsRes.rows) {
      const arr = byReturn.get(row.order_return_id) ?? [];
      arr.push(rowToReturnItem(row));
      byReturn.set(row.order_return_id, arr);
    }
    for (const r of returns) r.items = byReturn.get(r.id) ?? [];
  }

  return { returns, total: num(countRes.rows[0]?.cnt), page, page_size: pageSize };
}

export async function getOrderReturn(id: string): Promise<OrderReturn | null> {
  if (!isDatabaseConfigured || !isUuid(id)) return null;
  await ensureDatabase();
  const pool = getPool();
  const [returnRes, itemsRes] = await Promise.all([
    pool.query(`select * from order_returns where id = $1::uuid`, [id]),
    pool.query(`select * from order_return_items where order_return_id = $1::uuid order by created_at asc`, [id]),
  ]);
  if (returnRes.rows.length === 0) return null;
  return rowToReturn(returnRes.rows[0], itemsRes.rows.map(rowToReturnItem));
}
