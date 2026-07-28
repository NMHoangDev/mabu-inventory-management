import { NextResponse } from "next/server";
import {
  createCostAdjustment,
  listCostAdjustments,
  type CreateCostAdjustmentInput
} from "@/lib/cost-adjustments/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("cost_adjustments.view");
  if (guard) return guard;
  try {
    const list = await listCostAdjustments();
    return NextResponse.json(list);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách phiếu điều chỉnh." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const guard = await requirePermission("cost_adjustments.create");
  if (guard) return guard;
  try {
    const body = (await request.json()) as CreateCostAdjustmentInput;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "Phiếu điều chỉnh phải có ít nhất một sản phẩm." },
        { status: 400 }
      );
    }
    const created = await createCostAdjustment(body);
    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được phiếu điều chỉnh." },
      { status: 500 }
    );
  }
}
