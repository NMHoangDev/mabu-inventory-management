/**
 * Chặn truy cập khi chưa đăng nhập — port nguyên logic từ middleware.ts của
 * app chính (D:\InvoiceFlowManager\middleware.ts). Module này KHÔNG có login
 * form riêng: cookie `current_staff_id` do app chính set — với
 * STAFF_COOKIE_DOMAIN (vd ".timetech.markeeai.com") set ở app chính, cookie
 * dùng chung được cho subdomain riêng của module này (vd
 * zalo-forward.timetech.markeeai.com) mà không cần đăng nhập lại. Nếu
 * thiếu/không hợp lệ, hiển thị trang hướng dẫn quay lại app chính để đăng
 * nhập thay vì tự dựng login.
 */
import { NextRequest, NextResponse } from "next/server";

const STAFF_COOKIE_NAME = "current_staff_id";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function middleware(req: NextRequest) {
  if (/\.[a-zA-Z0-9]+$/.test(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const staffId = req.cookies.get(STAFF_COOKIE_NAME)?.value;
  if (!staffId) {
    return NextResponse.redirect(new URL("/login-required", req.url));
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

  return NextResponse.redirect(new URL("/login-required", req.url));
}

export const config = {
  // Giống app chính (middleware.ts root): loại trừ toàn bộ /api — mỗi route
  // API tự check quyền qua src/lib/zaloAuth.ts (canViewAccount/canBroadcastTo),
  // không chặn ở tầng middleware.
  matcher: ["/((?!api|_next/static|_next/image|login-required|favicon.ico).*)"]
};
