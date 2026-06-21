import { NextResponse } from "next/server";
import { getInventoryProductDetail } from "@/lib/products/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const product = await getInventoryProductDetail(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (error) {
    console.error("GET /api/inventory/products/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load inventory product." },
      { status: 500 }
    );
  }
}
