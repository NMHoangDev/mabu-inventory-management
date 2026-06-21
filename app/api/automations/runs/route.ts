import { NextResponse } from "next/server";
import { listRuns } from "@/lib/automations/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? 50)));
    const data = await listRuns(limit);
    return NextResponse.json({ runs: data });
  } catch (error) {
    console.error("GET /api/automations/runs failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
