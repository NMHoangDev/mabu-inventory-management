import { NextResponse } from "next/server";
import { computeFinanceSummary } from "@/lib/finance/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await computeFinanceSummary();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/finance/summary failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
