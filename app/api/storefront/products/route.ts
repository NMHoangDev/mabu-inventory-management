import { NextResponse } from "next/server";
import { listStorefrontProducts } from "@/lib/storefront/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    const category_slug = url.searchParams.get("category") ?? undefined;
    const page = Number(url.searchParams.get("page") ?? 1);
    const page_size = Number(url.searchParams.get("page_size") ?? 24);
    const result = await listStorefrontProducts({ search, category_slug, page, page_size });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/storefront/products failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load products." },
      { status: 500 }
    );
  }
}
