import { NextResponse } from "next/server";
import { getCostAdjustment } from "@/lib/cost-adjustments/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("cost_adjustments.view");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const data = await getCostAdjustment(id);
    if (!data) return NextResponse.json({ error: "Không tìm thấy phiếu điều chỉnh." }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được phiếu điều chỉnh." },
      { status: 500 }
    );
  }
}
