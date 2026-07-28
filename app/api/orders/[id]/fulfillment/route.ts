import { NextResponse } from "next/server";
import { z } from "zod";
import { transitionFulfillmentStatus } from "@/lib/orders/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  next_status: z.enum(["unshipped", "confirmed", "packing", "shipping", "shipped", "returned"]),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("orders.fulfill");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const result = await transitionFulfillmentStatus({ orderId: id, nextStatus: parsed.data.next_status });
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/orders/[id]/fulfillment failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update fulfillment status." },
      { status: 500 }
    );
  }
}
