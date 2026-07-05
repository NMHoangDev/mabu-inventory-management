import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmScanReceiptWithOptions } from "@/lib/inventory/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  rowId: z.string().min(1),
  action: z.enum(["add_stock", "new"]),
  productId: z.string().optional().nullable()
});

const bodySchema = z.object({
  documentId: z.string().optional(),
  rowIds: z.array(z.string()).min(1),
  decisions: z.array(decisionSchema).min(1),
  supplier_name: z.string().optional(),
  staff: z.string().optional(),
  branch: z.string().optional(),
  note: z.string().optional()
});

function routeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const result = await confirmScanReceiptWithOptions({
      documentId: data.documentId,
      rowIds: data.rowIds,
      decisions: data.decisions.map((d) => ({
        rowId: d.rowId,
        action: d.action,
        productId: d.productId ?? null
      })),
      supplier_name: data.supplier_name,
      staff: data.staff,
      branch: data.branch,
      note: data.note
    });
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/inventory/receipts/confirm-with-options failed:", error);
    return NextResponse.json({ error: routeError(error) }, { status: 500 });
  }
}