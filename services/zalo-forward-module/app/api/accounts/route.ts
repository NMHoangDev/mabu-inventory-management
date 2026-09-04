/**
 * GET /api/accounts — chỉ để populate dropdown "chọn tài khoản Zalo" trong
 * dashboard, KHÔNG có CRUD (quản lý account thật sự thuộc về
 * services/zalo-account-module). Proxy read-only qua bridge.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff, canViewAccount } from "@/lib/zaloAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BRIDGE_URL = process.env.ZALO_BRIDGE_URL || "http://localhost:3001";
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || "";

export async function GET(req: NextRequest) {
  try {
    const headers: Record<string, string> = {};
    if (BRIDGE_API_KEY) headers["x-api-key"] = BRIDGE_API_KEY;
    const res = await fetch(`${BRIDGE_URL}/auth/accounts`, { headers, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    let accounts = Array.isArray(data?.accounts) ? data.accounts : [];

    const staff = await getCurrentStaff(req);
    if (staff.role !== "admin") {
      accounts = accounts.filter((a: { account_id: string }) => canViewAccount(staff, a.account_id));
    }
    return NextResponse.json({ accounts });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ accounts: [], error: err?.message }, { status: 200 });
  }
}
