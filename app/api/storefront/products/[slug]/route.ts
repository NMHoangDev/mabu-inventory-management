import { NextResponse } from "next/server";
import { getStorefrontProductBySlug } from "@/lib/storefront/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const product = await getStorefrontProductBySlug(slug);
    if (!product) {
      return NextResponse.json({ error: "Không tìm thấy sản phẩm." }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (error) {
    console.error("GET /api/storefront/products/[slug] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load product." },
      { status: 500 }
    );
  }
}
