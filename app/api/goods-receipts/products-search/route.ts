import { NextResponse } from "next/server";
import { searchProductsForReceipt } from "@/lib/goods-receipts/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requirePermission("goods_receipts.view");
  if (guard) return guard;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    if (q.trim().length < 1) return NextResponse.json([]);
    const rows = await searchProductsForReceipt(q);
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tìm được sản phẩm." },
      { status: 500 }
    );
  }
}
