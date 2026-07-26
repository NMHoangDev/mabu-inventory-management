import { NextResponse } from "next/server";
import { getReturnableOrderDetail } from "@/lib/order-returns/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await context.params;
    const detail = await getReturnableOrderDetail(orderId);
    if (!detail) {
      return NextResponse.json({ error: "Không tìm thấy đơn hàng." }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    console.error("GET /api/order-returns/returnable/[orderId] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được đơn hàng." },
      { status: 500 }
    );
  }
}
