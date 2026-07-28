import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteCustomerGroup,
  updateCustomerGroup,
} from "@/lib/customers/repository";
import { requirePermission } from "@/lib/auth/permissions";

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
  const guard = await requirePermission("customers.edit");
  if (guard) return guard;
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
    const group = await updateCustomerGroup(id, {
      name: parsed.data.name ?? "",
      code: parsed.data.code ?? "",
      type: parsed.data.type ?? "Cố định",
      description: parsed.data.description ?? "",
    });
    if (!group) {
      return NextResponse.json({ error: "Customer group not found." }, { status: 404 });
    }
    return NextResponse.json(group);
  } catch (error) {
    console.error("PATCH /api/customer-groups/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update customer group." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission("customers.delete");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const success = await deleteCustomerGroup(id);
    if (!success) {
      return NextResponse.json({ error: "Customer group not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/customer-groups/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete customer group." },
      { status: 500 }
    );
  }
}
