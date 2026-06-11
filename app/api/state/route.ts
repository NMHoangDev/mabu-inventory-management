import { NextResponse } from "next/server";
import { readStore } from "@/lib/invoices/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function routeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

export async function GET() {
  try {
    return NextResponse.json(await readStore());
  } catch (error) {
    console.error("State API failed:", error);
    return NextResponse.json({ documents: [], rows: [], error: routeErrorMessage(error) }, { status: 500 });
  }
}
