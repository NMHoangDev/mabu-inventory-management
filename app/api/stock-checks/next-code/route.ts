import { NextResponse } from "next/server";
import { getNextStockCheckCode } from "@/lib/stock-checks/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const code = await getNextStockCheckCode();
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ code: "KTH00001" }, { status: 200 });
  }
}
