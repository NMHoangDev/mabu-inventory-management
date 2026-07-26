import { NextResponse } from "next/server";
import { getInventoryProductDetail, setInventoryProductStock } from "@/lib/products/inventory";
import { listSuppliersForProduct } from "@/lib/suppliers/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const product = await getInventoryProductDetail(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    const suppliers = await listSuppliersForProduct(product.id);
    return NextResponse.json({ product: { ...product, suppliers } });
  } catch (error) {
    console.error("GET /api/inventory/products/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load inventory product." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const stock = Number(body?.stock);
    if (!Number.isFinite(stock) || stock < 0) {
      return NextResponse.json({ error: "Số lượng tồn kho không hợp lệ." }, { status: 400 });
    }
    const result = await setInventoryProductStock(id, stock, {
      staff: typeof body?.staff === "string" ? body.staff : undefined,
    });
    return NextResponse.json({ product: result });
  } catch (error) {
    console.error("PATCH /api/inventory/products/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không cập nhật được tồn kho." },
      { status: 500 }
    );
  }
}
