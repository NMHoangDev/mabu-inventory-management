import { NextResponse } from "next/server";
import { getPromotion, updatePromotion, deletePromotion } from "@/lib/promotions/repository";
import { updatePromotionSchema } from "@/lib/promotions/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const promotion = await getPromotion(id);
    if (!promotion) {
      return NextResponse.json({ error: "Không tìm thấy khuyến mại." }, { status: 404 });
    }
    return NextResponse.json(promotion);
  } catch (error) {
    console.error("GET /api/promotions/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được khuyến mại." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const parsed = updatePromotionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const updated = await updatePromotion(id, parsed.data as any);
    if (!updated) {
      return NextResponse.json({ error: "Không tìm thấy khuyến mại." }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/promotions/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không cập nhật được khuyến mại." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const deleted = await deletePromotion(id);
    if (!deleted) {
      return NextResponse.json({ error: "Không tìm thấy khuyến mại." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/promotions/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không xoá được khuyến mại." },
      { status: 500 }
    );
  }
}
