import { NextResponse } from "next/server";
import {
  createStockCheck,
  listStockChecks,
  type CreateStockCheckInput
} from "@/lib/stock-checks/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const list = await listStockChecks();
    return NextResponse.json(list);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách phiếu kiểm." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateStockCheckInput;
    const created = await createStockCheck(body);
    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được phiếu kiểm." },
      { status: 500 }
    );
  }
}
