import { NextResponse } from "next/server";
import { getNextSupplierCode } from "@/lib/suppliers/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const code = await getNextSupplierCode();
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ code: "SUPN00001" }, { status: 200 });
  }
}
