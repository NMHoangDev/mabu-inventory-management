import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteSupplierGroup,
  updateSupplierGroup,
} from "@/lib/suppliers/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const group = await updateSupplierGroup(id, {
      name: parsed.data.name ?? "",
      code: parsed.data.code ?? "",
      type: parsed.data.type ?? "Cố định",
      description: parsed.data.description ?? "",
    });
    if (!group) {
      return NextResponse.json({ error: "Supplier group not found." }, { status: 404 });
    }
    return NextResponse.json(group);
  } catch (error) {
    console.error("PATCH /api/supplier-groups/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update supplier group." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const success = await deleteSupplierGroup(id);
    if (!success) {
      return NextResponse.json({ error: "Supplier group not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/supplier-groups/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete supplier group." },
      { status: 500 }
    );
  }
}
