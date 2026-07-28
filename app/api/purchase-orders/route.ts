import { NextResponse } from "next/server";
import {
  createPurchaseOrder,
  listPurchaseOrders,
  type CreatePurchaseOrderInput
} from "@/lib/purchase-orders/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("purchase_orders.view");
  if (guard) return guard;
  try {
    const list = await listPurchaseOrders();
    return NextResponse.json(list);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách đơn đặt hàng." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const guard = await requirePermission("purchase_orders.create");
  if (guard) return guard;
  try {
    const body = (await request.json()) as CreatePurchaseOrderInput;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "Đơn đặt hàng phải có ít nhất một sản phẩm." }, { status: 400 });
    }
    const created = await createPurchaseOrder(body);
    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được đơn đặt hàng." },
      { status: 500 }
    );
  }
}
