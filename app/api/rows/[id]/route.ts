import { NextResponse } from "next/server";
import { rowPatchSchema } from "@/lib/schema";
import { deleteRow, patchRow } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function routeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await deleteRow(id));
  } catch (error) {
    console.error("Delete row API failed:", error);
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const parsed = rowPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid row payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    return NextResponse.json(await patchRow(id, parsed.data));
  } catch (error) {
    console.error("Patch row API failed:", error);
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
