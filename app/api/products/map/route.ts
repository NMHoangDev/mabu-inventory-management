import { NextResponse } from "next/server";
import { addInventoryFromScan } from "@/lib/products/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { productId, rowIds } = body;
    if (!productId || !rowIds || !Array.isArray(rowIds)) {
      return NextResponse.json({ error: "Missing productId or rowIds." }, { status: 400 });
    }
    const success = await addInventoryFromScan(productId, rowIds);
    return NextResponse.json({ success });
  } catch (error) {
    console.error("Map product candidate API failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to map product candidate." },
      { status: 500 }
    );
  }
}
