import { NextResponse } from "next/server";
import { z } from "zod";
import { listOrderReturns, createOrderReturn } from "@/lib/order-returns/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requirePermission("order_returns.view");
  if (guard) return guard;
  try {
    const url = new URL(request.url);
    const result = await listOrderReturns({
      search: url.searchParams.get("search") || undefined,
      page: Number(url.searchParams.get("page")) || 1,
      page_size: Number(url.searchParams.get("page_size")) || 20,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/order-returns failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách phiếu trả hàng." },
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  order_id: z.string(),
  reason: z.string().optional(),
  items: z
    .array(
      z.object({
        order_item_id: z.string(),
        quantity_returned: z.number().int().min(1),
      })
    )
    .min(1, "Chưa chọn sản phẩm nào để trả."),
});

export async function POST(request: Request) {
  const guard = await requirePermission("order_returns.create");
  if (guard) return guard;
  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const created = await createOrderReturn(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/order-returns failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được phiếu trả hàng." },
      { status: 500 }
    );
  }
}
