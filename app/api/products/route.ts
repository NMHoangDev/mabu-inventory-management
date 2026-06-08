import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertCatalogProductMeta } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const productMetaSchema = z.object({
  sku: z.string().min(1),
  inputProductName: z.string().default(""),
  adjustedInvoiceName: z.string().default(""),
  retailName: z.string().default(""),
  unit: z.string().default(""),
  salePrice: z.string().default(""),
  imageUrl: z.string().default("")
});

export async function POST(request: Request) {
  try {
    const parsed = productMetaSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid product payload." }, { status: 400 });
    }

    const lookups = await upsertCatalogProductMeta(parsed.data);
    return NextResponse.json(lookups);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save product." }, { status: 500 });
  }
}
