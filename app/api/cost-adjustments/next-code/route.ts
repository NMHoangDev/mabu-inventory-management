import { NextResponse } from "next/server";
import { getNextCostAdjustmentCode } from "@/lib/cost-adjustments/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("cost_adjustments.view");
  if (guard) return guard;
  try {
    const code = await getNextCostAdjustmentCode();
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ code: "CPV00001" }, { status: 200 });
  }
}
