import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customers/auth";
import { listOrders } from "@/lib/orders/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chỉ trả đơn của CHÍNH khách đang đăng nhập — lọc theo customer_id lấy từ
// session, không nhận customer_id từ query string (tránh khách A xem được
// đơn của khách B bằng cách tự đổi param).
export async function GET(request: Request) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    }
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const page_size = Number(url.searchParams.get("page_size") ?? 20);
    const result = await listOrders({ customer_id: customer.id, page, page_size });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/storefront/orders failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load orders." },
      { status: 500 }
    );
  }
}
