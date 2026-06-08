import { NextResponse } from "next/server";
import { readLookups } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const lookups = await readLookups();
  return NextResponse.json(lookups);
}
