import { NextResponse } from "next/server";
import { getNextSupplierCode } from "@/lib/suppliers/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("suppliers.view");
  if (guard) return guard;
  try {
    const code = await getNextSupplierCode();
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ code: "SUPN00001" }, { status: 200 });
  }
}
