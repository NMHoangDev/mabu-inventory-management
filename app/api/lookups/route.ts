import { NextResponse } from "next/server";
import { readLookups } from "@/lib/products/lookups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emptyLookups = {
  suppliers: [],
  inputProductNames: [],
  internalProductCodes: [],
  adjustedInvoiceNames: [],
  retailNames: [],
  units: [],
  vatRates: [],
  products: []
};

function routeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

export async function GET() {
  try {
    const lookups = await readLookups();
    return NextResponse.json(lookups);
  } catch (error) {
    console.error("Lookups API failed:", error);
    return NextResponse.json({ ...emptyLookups, error: routeErrorMessage(error) }, { status: 500 });
  }
}
