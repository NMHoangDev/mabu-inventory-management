import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customers/auth";
import { getOrder } from "@/lib/orders/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    }
    const { id } = await context.params;
    const order = await getOrder(id);
    // Phải so customer_id kể cả khi order tồn tại — không dựa vào "đã đăng
    // nhập" là đủ, tránh khách A xem được đơn của khách B qua UUID (IDOR).
    if (!order || order.customer_id !== customer.id) {
      return NextResponse.json({ error: "Không tìm thấy đơn hàng." }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (error) {
    console.error("GET /api/storefront/orders/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load order." },
      { status: 500 }
    );
  }
}
