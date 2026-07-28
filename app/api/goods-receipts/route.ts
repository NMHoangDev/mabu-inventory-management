import { NextResponse } from "next/server";
import {
  createGoodsReceipt,
  listGoodsReceipts,
  type CreateGoodsReceiptInput
} from "@/lib/goods-receipts/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("goods_receipts.view");
  if (guard) return guard;
  try {
    const list = await listGoodsReceipts();
    return NextResponse.json(list);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách đơn nhập hàng." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const guard = await requirePermission("goods_receipts.create");
  if (guard) return guard;
  try {
    const body = (await request.json()) as CreateGoodsReceiptInput;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "Đơn nhập hàng phải có ít nhất một sản phẩm." },
        { status: 400 }
      );
    }
    const created = await createGoodsReceipt(body);
    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được đơn nhập hàng." },
      { status: 500 }
    );
  }
}
