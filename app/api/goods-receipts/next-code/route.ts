import { NextResponse } from "next/server";
import { getNextGoodsReceiptCode } from "@/lib/goods-receipts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const code = await getNextGoodsReceiptCode();
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ code: "PON00001" }, { status: 200 });
  }
}
