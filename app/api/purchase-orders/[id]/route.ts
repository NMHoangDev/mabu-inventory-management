import { NextResponse } from "next/server";
import { getPurchaseOrder } from "@/lib/purchase-orders/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const order = await getPurchaseOrder(id);
    if (!order) {
      return NextResponse.json({ error: "Không tìm thấy đơn đặt hàng." }, { status: 404 });
    }
    return NextResponse.json(order);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được đơn đặt hàng." },
      { status: 500 }
    );
  }
}
