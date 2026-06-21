import { NextResponse } from "next/server";
import { getSystemStockForCheck } from "@/lib/stock-checks/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getSystemStockForCheck();
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được tồn kho hệ thống." },
      { status: 500 }
    );
  }
}
