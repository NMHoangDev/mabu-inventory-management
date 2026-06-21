import { NextResponse } from "next/server";
import { getStockCheck } from "@/lib/stock-checks/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await getStockCheck(id);
    if (!data) {
      return NextResponse.json({ error: "Không tìm thấy phiếu kiểm hàng." }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được phiếu kiểm." },
      { status: 500 }
    );
  }
}
