import { NextResponse } from "next/server";
import { z } from "zod";
import {
  computeInventoryInsights,
  markSuggestionStatus,
  markSuggestionsBulk,
} from "@/lib/inventory/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await computeInventoryInsights();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/inventory/insights failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

const patchSchema = z.object({
  id: z.string().optional(),
  ids: z.array(z.string()).optional(),
  status: z.enum(["open", "dismissed", "ordered", "received"]),
});

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    const { id, ids, status } = parsed.data;
    if (id) {
      const ok = await markSuggestionStatus(id, status);
      return NextResponse.json({ success: ok });
    }
    if (ids && ids.length > 0) {
      const count = await markSuggestionsBulk(ids, status);
      return NextResponse.json({ success: true, updated: count });
    }
    return NextResponse.json({ error: "Missing id or ids" }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/inventory/insights failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
