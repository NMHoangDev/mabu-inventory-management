import { NextResponse } from "next/server";
import { z } from "zod";
import { transitionStockCheckStatus } from "@/lib/stock-checks/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  nextStatus: z.enum(["in_progress", "balanced", "cancelled"])
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
    const result = await transitionStockCheckStatus({
      stockCheckId: id,
      nextStatus: parsed.data.nextStatus
    });
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/stock-checks/[id]/status failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không đổi được trạng thái phiếu kiểm hàng." },
      { status: 500 }
    );
  }
}
