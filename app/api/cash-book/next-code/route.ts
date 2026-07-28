import { NextResponse } from "next/server";
import { getNextCashBookCode } from "@/lib/cash-book/repository";
import type { VoucherType } from "@/lib/cash-book/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const voucher_type = (url.searchParams.get("voucher_type") ?? "receipt") as VoucherType;
    const guard = await requirePermission(voucher_type === "payment" ? "payment_vouchers.view" : "receipt_vouchers.view");
    if (guard) return guard;
    const code = await getNextCashBookCode(voucher_type);
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ code: "RVN00001" }, { status: 200 });
  }
}
