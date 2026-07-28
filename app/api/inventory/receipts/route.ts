import { NextResponse } from "next/server";
import { z } from "zod";
import {
  autoCreateReceiptFromInvoiceRows,
  createStockReceipt,
  listStockReceipts,
} from "@/lib/inventory/receipts";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requirePermission("inventory.view");
  if (guard) return guard;
  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? 50)));
    const data = await listStockReceipts(limit);
    return NextResponse.json({ receipts: data });
  } catch (error) {
    console.error("GET /api/inventory/receipts failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

const autoSchema = z.object({
  mode: z.literal("auto_from_rows"),
  rowIds: z.array(z.string()).min(1),
  supplier_name: z.string().optional(),
  staff: z.string().optional(),
  branch: z.string().optional(),
  note: z.string().optional(),
});

const manualSchema = z.object({
  mode: z.literal("manual").optional(),
  source: z.enum(["manual", "transfer", "return", "scan"]).optional(),
  supplier_name: z.string().optional(),
  note: z.string().optional(),
  staff: z.string().optional(),
  branch: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().optional(),
    sku: z.string().optional(),
    product_name: z.string().min(1),
    unit: z.string().optional(),
    quantity: z.number().min(0.0001),
    unit_cost: z.number().min(0).optional(),
  })).min(1),
});

export async function POST(request: Request) {
  const guard = await requirePermission("inventory.create");
  if (guard) return guard;
  try {
    const body = await request.json();

    if (body?.mode === "auto_from_rows") {
      const parsed = autoSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
      }
      const result = await autoCreateReceiptFromInvoiceRows(parsed.data.rowIds, {
        supplier_name: parsed.data.supplier_name,
        staff: parsed.data.staff,
        branch: parsed.data.branch,
        note: parsed.data.note,
      });
      if (!result.created) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }
      return NextResponse.json({ receipt: result.receipt, message: result.message });
    }

    const parsed = manualSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const result = await createStockReceipt({
      source: parsed.data.source ?? "manual",
      supplier_name: parsed.data.supplier_name,
      note: parsed.data.note,
      staff: parsed.data.staff,
      branch: parsed.data.branch,
      items: parsed.data.items,
    });
    if (!result.receipt) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json({ receipt: result.receipt, message: result.message });
  } catch (error) {
    console.error("POST /api/inventory/receipts failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
