import { NextResponse } from "next/server";
import { getOrderReturn } from "@/lib/order-returns/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("order_returns.view");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const orderReturn = await getOrderReturn(id);
    if (!orderReturn) {
      return NextResponse.json({ error: "Không tìm thấy phiếu trả hàng." }, { status: 404 });
    }
    return NextResponse.json(orderReturn);
  } catch (error) {
    console.error("GET /api/order-returns/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được phiếu trả hàng." },
      { status: 500 }
    );
  }
}
