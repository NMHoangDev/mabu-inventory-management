import { NextResponse } from "next/server";
import { z } from "zod";
import { updateGoodsReceiptPayment } from "@/lib/inventory/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  paid: z.number().min(0),
  paymentMethod: z.enum(["cash", "bank_transfer", "card"])
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const raw = await request.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const result = await updateGoodsReceiptPayment({
      goodsReceiptId: id,
      paid: parsed.data.paid,
      paymentMethod: parsed.data.paymentMethod
    });
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/goods-receipts/[id]/payment failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không cập nhật được thanh toán." },
      { status: 500 }
    );
  }
}
