/**
 * POST /api/auth/google { credential } — Đăng nhập qua Google Identity
 * Services. Port theo pattern login_with_google() của
 * d:\CrawlDataLinkedin\linkedin_group_crawler\app\modules\all_platform\services\auth_service.py:
 *
 *   1) Verify id_token (credential) bằng Google OAuth Client ID — không cần
 *      client secret cho flow "Sign In With Google" phía trình duyệt.
 *   2) Email lấy từ token PHẢI đã tồn tại sẵn trong bảng `staff` (admin tự
 *      thêm qua tab "Nhân viên & Phân quyền") — KHÔNG tự tạo tài khoản mới ở
 *      đây, y hệt nguyên tắc "chỉ admin mới được cấp quyền" của reference.
 *   3) Set cookie current_staff_id giống hệt luồng email+password hiện có
 *      (/api/auth/login) — 2 cách đăng nhập cùng dẫn tới 1 session.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OAuth2Client } from "google-auth-library";
import { STAFF_COOKIE_NAME, STAFF_COOKIE_OPTS } from "@/lib/zaloAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

let _googleClient: OAuth2Client | null = null;
function getGoogleClient(): OAuth2Client | null {
  if (!GOOGLE_CLIENT_ID) return null;
  if (!_googleClient) _googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  return _googleClient;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const credential = typeof body?.credential === "string" ? body.credential : "";
  if (!credential) {
    return NextResponse.json({ error: "Thiếu credential từ Google" }, { status: 400 });
  }

  const googleClient = getGoogleClient();
  if (!googleClient) {
    return NextResponse.json({ error: "Google Sign-In chưa được cấu hình trên server (thiếu NEXT_PUBLIC_GOOGLE_CLIENT_ID)" }, { status: 500 });
  }

  let email = "";
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email_verified) {
      return NextResponse.json({ error: "Email Google chưa được xác minh" }, { status: 401 });
    }
    email = String(payload.email || "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Token Google không hợp lệ hoặc đã hết hạn" }, { status: 401 });
  }
  if (!email) {
    return NextResponse.json({ error: "Không lấy được email từ tài khoản Google" }, { status: 401 });
  }
  if (!SUPABASE_URL || !KEY) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 500 });
  }

  const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
  const { data: staff, error } = await sb
    .from("staff")
    .select("id,is_active")
    .ilike("email", email)
    .maybeSingle();
  if (error || !staff) {
    return NextResponse.json(
      { error: `Email ${email} chưa được cấp quyền truy cập. Liên hệ admin để được thêm vào tab "Nhân viên & Phân quyền".` },
      { status: 403 }
    );
  }
  if (!staff.is_active) {
    return NextResponse.json({ error: "Tài khoản đã bị vô hiệu hoá" }, { status: 403 });
  }

  const staffId = String(staff.id);
  const res = NextResponse.json({ ok: true, staffId });
  res.cookies.set(STAFF_COOKIE_NAME, staffId, STAFF_COOKIE_OPTS);
  return res;
}
