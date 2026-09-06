/**
 * Chặn truy cập khi chưa đăng nhập.
 *
 * Module này có login form riêng ở /login (app/api/auth/login) — không còn
 * bắt buộc phải đăng nhập ở app chính trước nữa, tuy vẫn dùng chung bảng
 * `staff` + cookie `current_staff_id` nên một khi đã đăng nhập ở app chính
 * VÀ có STAFF_COOKIE_DOMAIN dùng chung, cookie đó vẫn được nhận luôn (không
 * cần đăng nhập lại).
 *
 * Port nguyên logic từ middleware.ts của app chính (D:\InvoiceFlowManager\middleware.ts).
 */
import { NextRequest, NextResponse } from "next/server";

const STAFF_COOKIE_NAME = "current_staff_id";
const STAFF_COOKIE_DOMAIN = process.env.STAFF_COOKIE_DOMAIN || undefined;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function redirectToLogin(req: NextRequest, clearCookie = false) {
  const url = req.nextUrl.clone();
  const nextPath = `${url.pathname}${url.search}`;
  url.pathname = "/login";
  url.search = "";
  if (nextPath && nextPath !== "/login") {
    url.searchParams.set("next", nextPath);
  }
  const res = NextResponse.redirect(url);
  if (clearCookie) {
    res.cookies.set(STAFF_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
      ...(STAFF_COOKIE_DOMAIN ? { domain: STAFF_COOKIE_DOMAIN } : {})
    });
  }
  return res;
}

export async function middleware(req: NextRequest) {
  if (/\.[a-zA-Z0-9]+$/.test(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const staffId = req.cookies.get(STAFF_COOKIE_NAME)?.value;
  if (!staffId) {
    return redirectToLogin(req);
  }

  if (!SUPABASE_URL || !KEY) {
    return NextResponse.next();
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/staff?id=eq.${encodeURIComponent(staffId)}&is_active=eq.true&select=id`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: "no-store" }
    );
    if (res.ok) {
      const rows = (await res.json()) as unknown[];
      if (Array.isArray(rows) && rows.length > 0) {
        return NextResponse.next();
      }
    }
  } catch {
    /* fail-safe bên dưới */
  }

  return redirectToLogin(req, true);
}

export const config = {
  // Loại trừ toàn bộ /api — mỗi route API tự check quyền qua src/lib/zaloAuth.ts
  // (canViewAccount/canBroadcastTo), không chặn ở tầng middleware.
  matcher: ["/((?!api|zalo-bridge|_next/static|_next/image|login|favicon.ico).*)"]
};
