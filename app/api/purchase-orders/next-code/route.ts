import { NextResponse } from "next/server";
import { getNextPurchaseOrderCode } from "@/lib/purchase-orders/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
