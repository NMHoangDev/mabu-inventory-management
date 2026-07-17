import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteOrder, getOrder, updateOrder, updateOrderStatus } from "@/lib/orders/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemSchema = z.object({
  product_id: z.string().nullable(),
  product_name: z.string().min(1),
  product_sku: z.string().optional(),
  unit: z.string().optional(),
  image_url: z.string().optional(),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0),
  discount_type: z.enum(["amount", "percent"]).optional(),
  discount_value: z.number().min(0).optional(),
  note: z.string().optional(),
});

const updateSchema = z.object({
  customer_id: z.string().nullable().optional(),
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
  status: z.enum(["new", "processing", "completed", "cancelled"]).optional(),
  payment_status: z.enum(["unpaid", "partial", "paid", "refunded"]).optional(),
  fulfillment_status: z.enum(["unshipped", "confirmed", "packing", "shipping", "shipped", "returned"]).optional(),
  payment_method: z.enum(["cod", "bank_transfer", "card", "cash"]).optional(),
  source: z.enum(["store", "facebook", "website", "zalo", "other", "pos"]).optional(),
  branch: z.string().optional(),
  staff: z.string().optional(),
  note: z.string().optional(),
  discount: z.number().min(0).optional(),
  discount_type: z.enum(["amount", "percent"]).optional(),
  shipping_fee: z.number().min(0).optional(),
  paid: z.number().min(0).optional(),
  items: z.array(itemSchema).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const order = await getOrder(id);
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    return NextResponse.json(order);
  } catch (error) {
    console.error("GET /api/orders/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load order." },
      { status: 500 }
    );
  }
}

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
    // Support quick status update with { status: "..." } only
    if (
      Object.keys(parsed.data).length === 1 &&
      parsed.data.status &&
      !parsed.data.items
    ) {
      const ok = await updateOrderStatus(id, parsed.data.status);
      if (!ok) return NextResponse.json({ error: "Order not found." }, { status: 404 });
      const fresh = await getOrder(id);
      return NextResponse.json(fresh);
    }
    const order = await updateOrder(id, parsed.data);
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    return NextResponse.json(order);
  } catch (error) {
    console.error("PATCH /api/orders/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update order." },
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
    const ok = await deleteOrder(id);
    if (!ok) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/orders/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete order." },
      { status: 500 }
    );
  }
}
