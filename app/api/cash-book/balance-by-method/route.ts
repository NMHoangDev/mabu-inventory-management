import { NextResponse } from "next/server";
import { getCashBalanceByMethod } from "@/lib/cash-book/repository";
import { requireAnyPermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAnyPermission(["receipt_vouchers.view", "payment_vouchers.view"]);
  if (guard) return guard;
  try {
    const balances = await getCashBalanceByMethod();
    return NextResponse.json({ balances });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được số dư theo phương thức." },
      { status: 500 }
    );
  }
}
