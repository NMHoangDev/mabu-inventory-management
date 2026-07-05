/**
 * GET  /api/auth/zalo/me — trả về staff session hiện tại
 * POST /api/auth/zalo/me { staffId } — set cookie current_staff_id
 *
 * Cookie-based auth — chưa có login page chính thức. POST chấp nhận staffId
 * để admin switch sang staff user (vd khi test phân quyền).
 */

import { NextRequest, NextResponse } from "next/server";
import { STAFF_COOKIE_NAME, STAFF_COOKIE_OPTS, getCurrentStaff } from "@/lib/zalo/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { getCurrentStaffStrict } = await import("@/lib/zalo/auth");
  const strict = await getCurrentStaffStrict(req);
  if (strict) {
    return NextResponse.json({ staff: strict, has_session: true });
  }
  // Không có cookie/header → trả role=system + has_session=false để client
  // phân biệt được "user chưa login" vs "admin fallback" (backward compat).
  const admin = await getCurrentStaff(req);
  return NextResponse.json({
    staff: { ...admin, id: null, role: "system", full_name: "Chưa đăng nhập" },
    has_session: false
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const staffId = typeof body?.staffId === "string" ? body.staffId.trim() : "";
  if (!staffId) {
    return NextResponse.json({ error: "staffId required" }, { status: 400 });
  }
  // Validate UUID đơn giản (không gọi supabase — chỉ format check).
  if (!/^[0-9a-f-]{36}$/i.test(staffId)) {
    return NextResponse.json({ error: "staffId không hợp lệ" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true, staffId });
  res.cookies.set(STAFF_COOKIE_NAME, staffId, STAFF_COOKIE_OPTS);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(STAFF_COOKIE_NAME);
  return res;
}