import { NextResponse } from "next/server";
import { searchProductsForScan, findProductByExactSku } from "@/lib/goods-receipts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/products/search?q=<text>&sku=<exact-sku>&limit=15
//   - If "sku" param is provided (preferred for scan modal), do an exact-match
//     SKU lookup first. Returns:
//       { exact: <hit>|null, results: <top-N LIKE matches> }
//   - Otherwise behaves as a LIKE search by SKU or name.
//
// The scan modal needs to:
//   1. Auto-resolve the SKU printed on the scanned invoice → exact-match lookup.
//   2. Let the user pick a different product via a live search box (LIKE on
//      SKU + name). We union the two so the dropdown never feels empty as soon
//      as the user types.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const sku = url.searchParams.get("sku")?.trim() ?? "";
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 15)));

    if (sku) {
      const exact = await findProductByExactSku(sku);
      const results = q ? await searchProductsForScan(q, limit) : [];
      return NextResponse.json({ exact, results });
    }

    if (q.trim().length < 1) {
      return NextResponse.json({ exact: null, results: [] });
    }
    const results = await searchProductsForScan(q, limit);
    return NextResponse.json({ exact: null, results });
  } catch (error) {
    console.error("GET /api/products/search failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lỗi tìm sản phẩm." },
      { status: 500 }
    );
  }
}
