import { NextResponse } from "next/server";
import { getPurchaseOrder, updatePurchaseOrder, type UpdatePurchaseOrderInput } from "@/lib/purchase-orders/repository";

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

// Sửa tay đơn đặt hàng nhập (nhập nhầm sản phẩm/số lượng/giá) — updatePurchaseOrder
// tự chặn (throw) nếu đơn đã có phiếu nhập hàng liên kết, trả 409 ở đây.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdatePurchaseOrderInput;
    if (body.items && (!Array.isArray(body.items) || body.items.length === 0)) {
      return NextResponse.json({ error: "Đơn đặt hàng phải có ít nhất một sản phẩm." }, { status: 400 });
    }
    const updated = await updatePurchaseOrder(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Không tìm thấy đơn đặt hàng." }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không cập nhật được đơn đặt hàng.";
    const isLinkedGrConflict = message.includes("phiếu nhập hàng liên kết");
    return NextResponse.json({ error: message }, { status: isLinkedGrConflict ? 409 : 500 });
  }
}
