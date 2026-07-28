import { NextResponse } from "next/server";
import { getNextGoodsReceiptCode } from "@/lib/goods-receipts/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("goods_receipts.view");
  if (guard) return guard;
  try {
    const code = await getNextGoodsReceiptCode();
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ code: "PON00001" }, { status: 200 });
  }
}
