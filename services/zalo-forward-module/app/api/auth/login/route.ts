/**
 * Login độc lập cho module này — không còn phụ thuộc cookie set từ app
 * chính. Cùng cơ chế với app/api/auth/zalo/me/route.ts của app chính:
 *
 * GET    /api/auth/login  → session hiện tại (staff=null nếu chưa đăng nhập)
 * POST   /api/auth/login  { email, password } → tìm staff theo email, verify
 *   mật khẩu rồi set cookie current_staff_id. Bootstrap: staff chưa có
 *   password_hash (lần đăng nhập đầu) → mật khẩu gõ vào lần đầu thành mật
 *   khẩu chính thức.
 * DELETE /api/auth/login  → xoá cookie (đăng xuất)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { STAFF_COOKIE_NAME, STAFF_COOKIE_OPTS, getCurrentStaffStrict } from "@/lib/zaloAuth";
import { hashPassword, verifyPassword } from "@/lib/password";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET(req: NextRequest) {
  const staff = await getCurrentStaffStrict(req);
  return NextResponse.json({ staff, has_session: !!staff });
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
