/**
 * Chặn truy cập trực tiếp vào toàn bộ (dashboard) khi chưa đăng nhập.
 *
 * Trước đây KHÔNG có middleware nào cả — mọi trang /products, /orders,
 * /finance,... mở được mà không cần cookie (lib/zalo/auth.ts's getCurrentStaff()
 * chỉ fallback về "system admin" ở tầng gọi API, còn UI thì không hề chặn).
 * Middleware này verify cookie `current_staff_id` chống lại Supabase (staff
 * còn tồn tại + is_active) trước khi cho render trang — thay vì chỉ tin
 * chuỗi UUID client gửi lên.
 *
 * Chạy trên Edge runtime (không có `pg` pool) nên verify bằng REST fetch tới
 * Supabase, giống cách lib/zalo/auth.ts đã làm cho các route khác.
 */

import { NextRequest, NextResponse } from "next/server";

const STAFF_COOKIE_NAME = "current_staff_id";
// Phải khớp STAFF_COOKIE_DOMAIN dùng khi SET cookie (lib/zalo/auth.ts) — xoá
// cookie set với Domain=".x" mà gọi delete() không kèm domain thì trình duyệt
// coi là 2 cookie khác nhau, cookie cũ dùng chung subdomain sẽ KHÔNG bị xoá.
const STAFF_COOKIE_DOMAIN = process.env.STAFF_COOKIE_DOMAIN || undefined;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function redirectToLogin(req: NextRequest, clearCookie = false) {
  const url = req.nextUrl.clone();
  const next = url.pathname + url.search;
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(next)}`;
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
    return redirectToLogin(req);
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

  return redirectToLogin(req, true);
}

export const config = {
  // "shop" loại trừ ở đây vì đó là website bán hàng công khai cho khách hàng
  // (storefront, xem STOREFRONT_PLAN.md) — không phải trang quản lý nội bộ,
  // khách không có (và không cần) cookie current_staff_id.
  matcher: ["/((?!api|_next/static|_next/image|login|smoke|shop|favicon.ico).*)"]
};
