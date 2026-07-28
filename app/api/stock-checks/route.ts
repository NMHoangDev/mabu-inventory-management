import { NextResponse } from "next/server";
import {
  createStockCheck,
  listStockChecks,
  type CreateStockCheckInput
} from "@/lib/stock-checks/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("stock_checks.view");
  if (guard) return guard;
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
  const guard = await requirePermission("stock_checks.create");
  if (guard) return guard;
  try {
    const body = (await request.json()) as CreateStockCheckInput;
    if (body.status === "balanced") {
      const balanceGuard = await requirePermission("stock_checks.balance");
      if (balanceGuard) return balanceGuard;
    }
    const created = await createStockCheck(body);
    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được phiếu kiểm." },
      { status: 500 }
    );
  }
}
