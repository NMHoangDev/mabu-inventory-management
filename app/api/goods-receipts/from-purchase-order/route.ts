import { NextResponse } from "next/server";
import { z } from "zod";
import { createGoodsReceiptFromPurchaseOrder } from "@/lib/inventory/receipts";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  purchaseOrderId: z.string().min(1),
  staff: z.string().optional(),
  branch: z.string().optional(),
  note: z.string().optional()
});

export async function POST(request: Request) {
  const guard = await requirePermission("goods_receipts.create");
  if (guard) return guard;
  try {
    const raw = await request.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const result = await createGoodsReceiptFromPurchaseOrder(parsed.data);
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/goods-receipts/from-purchase-order failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được đơn nhập hàng." },
      { status: 500 }
    );
  }
}
