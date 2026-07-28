import { NextResponse } from "next/server";
import { z } from "zod";
import { transitionCostAdjustmentStatus } from "@/lib/cost-adjustments/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  nextStatus: z.enum(["in_progress", "completed", "cancelled"])
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission("cost_adjustments.edit");
  if (guard) return guard;
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
    const result = await transitionCostAdjustmentStatus({
      costAdjustmentId: id,
      nextStatus: parsed.data.nextStatus
    });
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/cost-adjustments/[id]/status failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không đổi được trạng thái phiếu điều chỉnh." },
      { status: 500 }
    );
  }
}
