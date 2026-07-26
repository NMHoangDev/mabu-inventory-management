import { NextResponse } from "next/server";
import { getCashBalanceByMethod } from "@/lib/cash-book/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
