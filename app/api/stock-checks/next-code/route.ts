import { NextResponse } from "next/server";
import { getNextStockCheckCode } from "@/lib/stock-checks/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("stock_checks.view");
  if (guard) return guard;
  try {
    const code = await getNextStockCheckCode();
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ code: "KTH00001" }, { status: 200 });
  }
}
