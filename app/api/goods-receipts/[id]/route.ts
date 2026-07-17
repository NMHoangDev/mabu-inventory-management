import { NextResponse } from "next/server";
import { getGoodsReceipt, updateGoodsReceipt, type UpdateGoodsReceiptInput } from "@/lib/goods-receipts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await getGoodsReceipt(id);
    if (!data) {
      return NextResponse.json({ error: "Không tìm thấy đơn nhập hàng." }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được đơn nhập hàng." },
      { status: 500 }
    );
  }
}

// Sửa tay đơn nhập hàng đã tạo (nhập nhầm sản phẩm/số lượng/giá) — cho phép
// ở MỌI trạng thái, kể cả "completed" (updateGoodsReceipt tự hoàn/cộng lại
// tồn kho tương ứng, xem lib/goods-receipts/repository.ts).
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateGoodsReceiptInput;
    if (body.items && (!Array.isArray(body.items) || body.items.length === 0)) {
      return NextResponse.json({ error: "Đơn nhập hàng phải có ít nhất một sản phẩm." }, { status: 400 });
    }
    const updated = await updateGoodsReceipt(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Không tìm thấy đơn nhập hàng." }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không cập nhật được đơn nhập hàng." },
      { status: 500 }
    );
  }
}
