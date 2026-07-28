import { NextResponse } from "next/server";
import { getInventoryProductDetail } from "@/lib/products/inventory";
import { deleteProduct, updateProduct } from "@/lib/products/repository";
import { listSuppliersForProduct } from "@/lib/suppliers/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("products.view");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const product = await getInventoryProductDetail(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    const suppliers = await listSuppliersForProduct(product.id);
    return NextResponse.json({ ...product, suppliers });
  } catch (error) {
    console.error("Get product API failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load product." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("products.edit");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const body = await request.json();
    const updated = await updateProduct(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update product API failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update product." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("products.delete");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const success = await deleteProduct(id);
    if (!success) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete product API failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete product." },
      { status: 500 }
    );
  }
}
