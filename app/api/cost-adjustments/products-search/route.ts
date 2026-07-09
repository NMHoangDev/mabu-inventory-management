import { NextResponse } from "next/server";
import { searchProductsForCostAdjustment } from "@/lib/cost-adjustments/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    // Query rỗng → trả về danh sách sản phẩm đầu tiên (dùng cho chế độ "chọn
    // nhiều" duyệt sản phẩm mà không cần gõ tìm kiếm). ILIKE '%%' khớp mọi tên.
    const rows = await searchProductsForCostAdjustment(q);
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tìm được sản phẩm." },
      { status: 500 }
    );
  }
}
