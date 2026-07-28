import { NextResponse } from "next/server";
import { confirmOrder } from "@/lib/orders/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("orders.approve");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const result = await confirmOrder(id);
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/orders/[id]/confirm failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to confirm order." },
      { status: 500 }
    );
  }
}
