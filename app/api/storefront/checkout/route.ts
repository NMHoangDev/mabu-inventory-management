import { NextResponse } from "next/server";
import { z } from "zod";
import { checkout } from "@/lib/storefront/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên."),
  phone: z.string().min(8, "Số điện thoại không hợp lệ."),
  items: z
    .array(z.object({ product_id: z.string(), quantity: z.number().int().min(1) }))
    .min(1, "Giỏ hàng đang trống."),
  payment_method: z.enum(["cod", "bank_transfer", "card"]),
  shipping_address: z.string().min(1, "Vui lòng nhập địa chỉ giao hàng."),
  note: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." },
        { status: 400 }
      );
    }
    const order = await checkout(parsed.data);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error("POST /api/storefront/checkout failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Đặt hàng thất bại." },
      { status: 400 }
    );
  }
}
