import { NextResponse } from "next/server";
import { listReturnableOrders } from "@/lib/order-returns/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await listReturnableOrders({
      search: url.searchParams.get("search") || undefined,
      page: Number(url.searchParams.get("page")) || 1,
      page_size: Number(url.searchParams.get("page_size")) || 20,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/order-returns/returnable failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách đơn hàng." },
      { status: 500 }
    );
  }
}
