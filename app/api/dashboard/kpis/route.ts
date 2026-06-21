import { NextResponse } from "next/server";
import { computeDashboardKpis } from "@/lib/dashboard/kpis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await computeDashboardKpis();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/dashboard/kpis failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
