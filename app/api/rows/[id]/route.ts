import { NextResponse } from "next/server";
import { rowPatchSchema } from "@/lib/schema";
import { deleteRow, patchRow } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.json(await deleteRow(id));
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = rowPatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid row payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(await patchRow(id, parsed.data));
}
