import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteShipping,
  getShipping,
  updateShipping,
} from "@/lib/shipping/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission("shipping.view");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const shipping = await getShipping(id);
    if (!shipping) {
      return NextResponse.json({ error: "Shipping not found." }, { status: 404 });
    }
    return NextResponse.json(shipping);
  } catch (error) {
    console.error("GET /api/shippings/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load shipping." },
      { status: 500 }
    );
  }
}

const updateSchema = z.object({
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
  shipping_address: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  ward: z.string().optional(),
  partner: z.string().optional(),
  partner_service: z.string().optional(),
  status: z
    .enum([
      "pending",
      "packing",
      "awaiting_pickup",
      "shipping",
      "delivered",
      "returning",
      "cancelled",
      "returned",
      "failed",
    ])
    .optional(),
  cod_amount: z.number().min(0).optional(),
  shipping_fee: z.number().min(0).optional(),
  weight: z.number().min(0).optional(),
  note: z.string().optional(),
  branch: z.string().optional(),
  staff: z.string().optional(),
  event: z
    .object({
      status: z.string(),
      description: z.string(),
      location: z.string(),
    })
    .optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission("shipping.edit");
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
    const { event, ...rest } = parsed.data;
    const shipping = await updateShipping(id, rest, event);
    if (!shipping) {
      return NextResponse.json({ error: "Shipping not found." }, { status: 404 });
    }
    return NextResponse.json(shipping);
  } catch (error) {
    console.error("PATCH /api/shippings/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update shipping." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission("shipping.delete");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const ok = await deleteShipping(id);
    if (!ok) return NextResponse.json({ error: "Shipping not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/shippings/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete shipping." },
      { status: 500 }
    );
  }
}
