import { NextResponse } from "next/server";
import { listProductsForSupplier, addProductsToSupplier } from "@/lib/suppliers/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("suppliers.view");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const rows = await listProductsForSupplier(id);
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách sản phẩm." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("suppliers.edit");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { product_ids?: string[] };
    const productIds = Array.isArray(body.product_ids) ? body.product_ids : [];
    if (productIds.length === 0) {
      return NextResponse.json({ error: "Thiếu danh sách sản phẩm." }, { status: 400 });
    }
    await addProductsToSupplier(id, productIds);
    const rows = await listProductsForSupplier(id);
    return NextResponse.json(rows, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thêm được sản phẩm." },
      { status: 500 }
    );
  }
}
