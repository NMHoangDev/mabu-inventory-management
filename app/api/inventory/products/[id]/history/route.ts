import { NextResponse } from "next/server";
import { getProductStockHistory } from "@/lib/products/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const history = await getProductStockHistory(id);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("GET /api/inventory/products/[id]/history failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load stock history." },
      { status: 500 }
    );
  }
}
