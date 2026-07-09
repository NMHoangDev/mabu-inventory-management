import { NextResponse } from "next/server";
import { listStorefrontCategories } from "@/lib/storefront/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const categories = await listStorefrontCategories();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("GET /api/storefront/categories failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load categories." },
      { status: 500 }
    );
  }
}
