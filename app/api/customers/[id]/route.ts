import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteCustomer, getCustomerById, updateCustomer } from "@/lib/customers/repository";
import type { CustomerInput } from "@/lib/customers/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const customer = await getCustomerById(id);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    return NextResponse.json(customer);
  } catch (error) {
    console.error("GET /api/customers/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load customer." },
      { status: 500 }
    );
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  gender: z.enum(["male", "female", "other", ""]).optional(),
  birthday: z.string().optional(),
  company: z.string().optional(),
  tax_code: z.string().optional(),
  website: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  group_id: z.string().nullable().optional(),
  assigner_id: z.string().optional(),
  addresses: z
    .array(
      z.object({
        is_default: z.boolean().default(false),
        recipient_name: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        ward: z.string().optional(),
        district: z.string().optional(),
        city: z.string().optional(),
        region: z.string().optional(),
        postal_code: z.string().optional(),
        address_type: z.enum(["shipping", "billing", "other"]).default("shipping"),
      })
    )
    .optional(),
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
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const updated = await updateCustomer(id, {
      ...parsed.data,
      gender: parsed.data.gender || undefined,
    } as CustomerInput);
    if (!updated) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/customers/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update customer." },
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
    const success = await deleteCustomer(id);
    if (!success) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/customers/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete customer." },
      { status: 500 }
    );
  }
}
