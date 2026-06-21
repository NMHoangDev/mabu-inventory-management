import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteRule, updateRule } from "@/lib/automations/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  trigger: z.string().optional(),
  conditions: z.array(z.any()).optional(),
  actions: z.array(z.any()).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    // Strip undefined values so we never accidentally set a NOT NULL column to null
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) patch[k] = v;
    }
    const ok = await updateRule(id, patch);
    return NextResponse.json({ success: ok });
  } catch (error) {
    console.error("PATCH /api/automations/[id] failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ok = await deleteRule(id);
    return NextResponse.json({ success: ok });
  } catch (error) {
    console.error("DELETE /api/automations/[id] failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
