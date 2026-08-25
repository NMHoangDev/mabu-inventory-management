/**
 * GET  /api/auth/zalo/me — trả về staff session hiện tại
 * POST /api/auth/zalo/me { email, password } — tìm staff theo email, verify
 *   mật khẩu rồi mới set cookie current_staff_id.
 *
 * Trước đây POST chỉ format-check staffId (bất kỳ UUID nào cũng login được,
 * không hề kiểm tra credential) — đây là lỗ hổng auth nghiêm trọng đã fix.
 * Sau đó đổi từ "chọn tên trong danh sách" sang nhập email+mật khẩu trực tiếp
 * (không hiển thị danh sách toàn bộ nhân viên ở trang login nữa).
 * Bootstrap: staff chưa có password_hash (lần đăng nhập đầu, kể cả admin@local
 * được seed sẵn) → mật khẩu gõ vào lần đầu sẽ được lưu làm mật khẩu chính thức.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { STAFF_COOKIE_NAME, STAFF_COOKIE_OPTS, getCurrentStaff } from "@/lib/zalo/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getCurrentStaffPermissions } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export async function GET(req: NextRequest) {
  const { getCurrentStaffStrict } = await import("@/lib/zalo/auth");
  const strict = await getCurrentStaffStrict(req);
  // Permission set của hệ thống roles/role_permissions mới (module nghiệp vụ) —
  // hoàn toàn độc lập với staff.role (admin/staff) cũ dùng cho Zalo.
  const permCtx = await getCurrentStaffPermissions();
  const roleId = permCtx?.roleId ?? null;
  const roleName = permCtx?.roleName ?? null;
  const permissions = permCtx ? Array.from(permCtx.permissions) : [];
  if (strict) {
    return NextResponse.json({ staff: strict, has_session: true, role_id: roleId, role_name: roleName, permissions });
  }
  // Không có cookie/header → trả role=system + has_session=false để client
  // phân biệt được "user chưa login" vs "admin fallback" (backward compat).
  const admin = await getCurrentStaff(req);
  return NextResponse.json({
    staff: { ...admin, id: null, role: "system", full_name: "Chưa đăng nhập" },
    has_session: false,
    role_id: roleId,
    role_name: roleName,
    permissions
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email) {
    return NextResponse.json({ error: "Vui lòng nhập email." }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "Mật khẩu cần ít nhất 4 ký tự." }, { status: 400 });
  }
  if (!SUPABASE_URL || !KEY) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 500 });
  }

  const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
  const { data: staff, error } = await sb
    .from("staff")
    .select("id,is_active,password_hash")
    .ilike("email", email)
    .maybeSingle();
  if (error || !staff) {
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng." }, { status: 401 });
  }
  if (!staff.is_active) {
    return NextResponse.json({ error: "Tài khoản đã bị vô hiệu hoá." }, { status: 403 });
  }

  const staffId = String(staff.id);
  if (!staff.password_hash) {
    // Lần đăng nhập đầu tiên cho tài khoản này → set mật khẩu vừa nhập.
    const password_hash = hashPassword(password);
    const { error: updateErr } = await sb.from("staff").update({ password_hash }).eq("id", staffId);
    if (updateErr) {
      return NextResponse.json({ error: "Không thiết lập được mật khẩu." }, { status: 500 });
    }
  } else if (!verifyPassword(password, staff.password_hash)) {
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng." }, { status: 401 });
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