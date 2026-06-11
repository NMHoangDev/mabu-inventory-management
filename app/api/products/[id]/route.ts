import { NextResponse } from "next/server";
import { deleteProduct, updateProduct } from "@/lib/products/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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
