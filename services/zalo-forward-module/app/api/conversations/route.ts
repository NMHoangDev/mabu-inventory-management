/**
 * GET /api/conversations?account_id=shop-owner — proxy trực tiếp qua
 * zalo-bridge (nguồn live, không qua cache Supabase của app chính) để lấy
 * danh sách nhóm cho group-picker của rule editor.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff, canViewAccount } from "@/lib/zaloAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BRIDGE_URL = process.env.ZALO_BRIDGE_URL || "http://localhost:3001";
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || "";

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id") || "shop-owner";
  const staff = await getCurrentStaff(req);
  if (!canViewAccount(staff, accountId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const headers: Record<string, string> = {};
    if (BRIDGE_API_KEY) headers["x-api-key"] = BRIDGE_API_KEY;
    const res = await fetch(
      `${BRIDGE_URL}/api/all-platform/zalo/conversations?account_id=${encodeURIComponent(accountId)}&limit=500`,
      { headers, cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ conversations: [], error: data?.error || `bridge ${res.status}` }, { status: 200 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ conversations: [], error: err?.message }, { status: 200 });
  }
}
