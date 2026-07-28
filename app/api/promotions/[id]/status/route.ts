import { NextResponse } from "next/server";
import { setPromotionStatus } from "@/lib/promotions/repository";
import { promotionStatusSchema } from "@/lib/promotions/validation";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Route riêng cho nút bật/tắt nhanh ở trang danh sách — hẹp, không thể lỡ ghi đè `rules`. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("promotions.edit");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const parsed = promotionStatusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Trạng thái không hợp lệ.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const updated = await setPromotionStatus(id, parsed.data.status);
    if (!updated) {
      return NextResponse.json({ error: "Không tìm thấy khuyến mại." }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/promotions/[id]/status failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không đổi được trạng thái." },
      { status: 500 }
    );
  }
}
