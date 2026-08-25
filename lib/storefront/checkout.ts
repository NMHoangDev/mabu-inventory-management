/**
 * lib/storefront/checkout.ts — tạo đơn hàng từ giỏ hàng storefront.
 * Checkout kiểu "khách vãng lai" (không yêu cầu đăng nhập) — khớp đúng UX gốc
 * của giao diện Denfood: chỉ hỏi tên/SĐT/địa chỉ, xác nhận đơn qua Zalo. Server
 * tự tìm-hoặc-tạo customers theo SĐT để đơn vẫn gắn được customer_id thật.
 *
 * KHÔNG tin giá/tồn kho client gửi lên (có thể bị sửa qua devtools) — luôn
 * tra lại `products` để lấy giá/tên/tồn kho hiện tại trước khi gọi
 * createOrder(). Xem STOREFRONT_PLAN.md mục 4.
 */

import { getPool, isDatabaseConfigured } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { createOrder, type Order, type PaymentMethod } from "../orders/repository";
import { createCustomer } from "../customers/repository";

export interface CheckoutItemInput {
  product_id: string;
  quantity: number;
}

export interface CheckoutInput {
  name: string;
  phone: string;
  items: CheckoutItemInput[];
  payment_method: PaymentMethod;
  shipping_address: string;
  note?: string;
}

async function findOrCreateCustomer(pool: ReturnType<typeof getPool>, name: string, phone: string) {
  const existing = await pool.query(`select id, name, phone from customers where phone = $1 limit 1`, [phone]);
  if (existing.rows.length > 0) return existing.rows[0] as { id: string; name: string; phone: string };
  const created = await createCustomer({ name, phone });
  return { id: created.id, name: created.name, phone: created.phone };
}

export async function checkout(input: CheckoutInput): Promise<Order> {
  if (!isDatabaseConfigured) throw new Error("Database chưa cấu hình.");
  if (!input.items.length) throw new Error("Giỏ hàng đang trống.");
  if (!input.name.trim()) throw new Error("Vui lòng nhập tên.");
  if (!input.phone.trim()) throw new Error("Vui lòng nhập số điện thoại.");
  if (!input.shipping_address?.trim()) throw new Error("Vui lòng nhập địa chỉ giao hàng.");

  await ensureDatabase();
  const pool = getPool();

  const ids = input.items.map((it) => it.product_id);
  const res = await pool.query(
    `select id, name, sku, unit, price, coalesce(stock, 0) as stock
       from products
      where id = any($1) and status = 'active' and published_at is not null`,
    [ids]
  );
  const productsById = new Map(res.rows.map((r) => [r.id, r]));

  const orderItems = input.items.map((it) => {
    const product = productsById.get(it.product_id);
    if (!product) {
      throw new Error(`Sản phẩm không còn tồn tại hoặc đã ngừng bán (id: ${it.product_id}).`);
    }
    const quantity = Math.max(1, Math.floor(it.quantity));
    if (quantity > Number(product.stock)) {
      throw new Error(`"${product.name}" chỉ còn ${product.stock} sản phẩm, không đủ số lượng bạn chọn (${quantity}).`);
    }
    return {
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku ?? "",
      unit: product.unit ?? "",
      quantity,
      unit_price: Number(product.price ?? 0),
    };
  });

  const customer = await findOrCreateCustomer(pool, input.name.trim(), input.phone.trim());

  const addressNote = `Địa chỉ giao hàng: ${input.shipping_address.trim()}`;
  const note = input.note?.trim() ? `${addressNote}\n${input.note.trim()}` : addressNote;

  return createOrder({
    customer_id: customer.id,
    customer_name: customer.name,
    customer_phone: customer.phone,
    status: "new",
    payment_status: "unpaid",
    fulfillment_status: "unshipped",
    payment_method: input.payment_method,
    source: "website",
    note,
    items: orderItems,
  });
}
