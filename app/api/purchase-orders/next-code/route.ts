import { NextResponse } from "next/server";
import { getNextPurchaseOrderCode } from "@/lib/purchase-orders/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("purchase_orders.view");
  if (guard) return guard;
  try {
    const code = await getNextPurchaseOrderCode();
    return NextResponse.json({ code });
  } catch (error) {
    return NextResponse.json(
      { code: "OSN00001", error: error instanceof Error ? error.message : "Fallback code" },
      { status: 200 }
    );
  }
}
