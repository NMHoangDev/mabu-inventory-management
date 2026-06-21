import { NextResponse } from "next/server";
import { getNextCostAdjustmentCode } from "@/lib/cost-adjustments/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const code = await getNextCostAdjustmentCode();
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ code: "CPV00001" }, { status: 200 });
  }
}
