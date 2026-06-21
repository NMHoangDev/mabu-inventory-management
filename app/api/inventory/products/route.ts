import { NextResponse } from "next/server";
import { listInventoryProducts } from "@/lib/products/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await listInventoryProducts();
    return NextResponse.json({ products });
  } catch (error) {
    console.error("GET /api/inventory/products failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load inventory products." },
      { status: 500 }
    );
  }
}
