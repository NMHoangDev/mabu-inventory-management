/**
 * Chặn truy cập trực tiếp vào toàn bộ trang admin của module khi chưa đăng
 * nhập ở app chính.
 *
 * Module này KHÔNG có login form riêng — nó chỉ được truy cập sau khi staff
 * đã đăng nhập ở app chính (InvoiceFlow Manager) và có cookie
 * `current_staff_id`. Nếu thiếu/hết hạn cookie đó, thay vì redirect tới
 * /login (không tồn tại ở đây), điều hướng tới /login-required — trang tĩnh
 * hướng dẫn quay lại app chính để đăng nhập.
 *
 * Ported từ middleware.ts của app chính (cùng cách verify: REST fetch trực
 * tiếp tới Supabase, Edge-runtime-safe, không dùng `pg`).
 *
 * Deploy ở subdomain riêng (vd zalo-accounts.timetech.markeeai.com), domain
 * root — không dùng basePath/path-prefix.
 */

import { NextRequest, NextResponse } from "next/server";

const STAFF_COOKIE_NAME = "current_staff_id";
// Phải khớp STAFF_COOKIE_DOMAIN dùng khi app chính SET cookie (lib/zalo/auth.ts)
// — vd ".timetech.markeeai.com" để module ở subdomain riêng nhận được cookie
// đăng nhập chung. Xoá cookie set với Domain=".x" mà không kèm domain khi xoá
// thì trình duyệt coi là 2 cookie khác nhau, không xoá được.
const STAFF_COOKIE_DOMAIN = process.env.STAFF_COOKIE_DOMAIN || undefined;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function redirectToLoginRequired(req: NextRequest, clearCookie = false) {
  const url = req.nextUrl.clone();
  url.pathname = "/login-required";
  url.search = "";
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
  // Bỏ qua request tới file tĩnh (ảnh, manifest, ...) lọt qua matcher bên dưới.
  if (/\.[a-zA-Z0-9]+$/.test(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const staffId = req.cookies.get(STAFF_COOKIE_NAME)?.value;
  if (!staffId) {
    return redirectToLoginRequired(req);
  }

  if (!SUPABASE_URL || !KEY) {
    // Thiếu env để verify — cho qua thay vì khoá cứng toàn bộ app, nhưng vẫn
    // yêu cầu có cookie ở nhánh trên.
    return NextResponse.next();
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/staff?id=eq.${encodeURIComponent(staffId)}&is_active=eq.true&select=id`,
      {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
        cache: "no-store"
      }
    );
    if (res.ok) {
      const rows = (await res.json()) as unknown[];
      if (Array.isArray(rows) && rows.length > 0) {
        return NextResponse.next();
      }
    }
  } catch {
    // Lỗi mạng khi verify → fail-safe, coi như chưa đăng nhập.
  }

  return redirectToLoginRequired(req, true);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|login-required|favicon.ico).*)"]
};
