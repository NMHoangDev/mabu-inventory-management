/**
 * GET /api/storefront/orders/lookup?code=&phone= — tra cứu đơn công khai, không
 * cần đăng nhập (storefront /shop/don không có tài khoản khách hàng). So khớp
 * `orders.code` + 4 số cuối SĐT — cùng mức bảo mật với bản gốc Denfood (đủ để
 * chặn dò ngẫu nhiên, không lộ dữ liệu nội bộ nào ngoài đơn của chính khách đó).
 */
import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = { error: "Không tìm thấy đơn hàng. Kiểm tra lại mã đơn và số điện thoại." };

function extractAddress(note: string | null): string {
  if (!note) return "";
  const firstLine = note.split("\n")[0] ?? "";
  const prefix = "Địa chỉ giao hàng: ";
  return firstLine.startsWith(prefix) ? firstLine.slice(prefix.length) : "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  const phone = (url.searchParams.get("phone") ?? "").trim();

  if (!code || phone.length < 4) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }
  if (!isDatabaseConfigured) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  await ensureDatabase();
  const pool = getPool();

  const orderRes = await pool.query(
    `select id, code, customer_name, customer_phone, status, payment_status,
            fulfillment_status, total, note, created_at
       from orders where code = $1 limit 1`,
    [code]
  );
  const order = orderRes.rows[0];
  if (!order || !String(order.customer_phone ?? "").endsWith(phone.slice(-4))) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  const itemsRes = await pool.query(
    `select product_name, quantity, unit_price, line_total
       from order_items where order_id = $1 order by position asc, created_at asc`,
    [order.id]
  );

  return NextResponse.json({
    order: {
      code: order.code,
      customer_name: order.customer_name,
      status: order.status,
      payment_status: order.payment_status,
      fulfillment_status: order.fulfillment_status,
      total: Number(order.total ?? 0),
      address: extractAddress(order.note),
      created_at: order.created_at,
      items: itemsRes.rows.map((r) => ({
        product_name: r.product_name,
        quantity: Number(r.quantity ?? 0),
        unit_price: Number(r.unit_price ?? 0),
        line_total: Number(r.line_total ?? 0),
      })),
    },
  });
}
