import { NextResponse } from "next/server";
import { z } from "zod";
import { readLookups } from "@/lib/products/lookups";
import { upsertCatalogProductMeta, getProducts, createProduct } from "@/lib/products/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("products.view");
  if (guard) return guard;
  try {
    const list = await getProducts();
    return NextResponse.json(list);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load products." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // If it's a standard product form submission (contains "name")
    if (body.name) {
      const guard = await requirePermission("products.create");
      if (guard) return guard;
      const created = await createProduct(body);
      return NextResponse.json(created);
    }

    // Otherwise, handle the quick invoice-scan mapping completion — dùng bởi
    // pipeline OCR (scan/summary), module này KHÔNG nằm trong hệ thống phân
    // quyền mới nên không guard nhánh này.
    const productMetaSchema = z.object({
      sku: z.string().min(1),
      inputProductName: z.string().default(""),
      adjustedInvoiceName: z.string().default(""),
      retailName: z.string().default(""),
      unit: z.string().default(""),
      salePrice: z.string().default(""),
      imageUrl: z.string().default("")
    });

    const parsed = productMetaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid product payload." }, { status: 400 });
    }

    await upsertCatalogProductMeta(parsed.data);
    const lookups = await readLookups();
    return NextResponse.json(lookups);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not process product request." },
      { status: 500 }
    );
  }
}
