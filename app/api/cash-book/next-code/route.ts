import { NextResponse } from "next/server";
import { getNextCashBookCode } from "@/lib/cash-book/repository";
import type { VoucherType } from "@/lib/cash-book/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const voucher_type = (url.searchParams.get("voucher_type") ?? "receipt") as VoucherType;
    const code = await getNextCashBookCode(voucher_type);
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ code: "RVN00001" }, { status: 200 });
  }
}
