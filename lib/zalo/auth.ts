/**
 * lib/zalo/auth.ts — session/auth helpers cho Zalo multi-account (Phase 3).
 *
 * Hiện tại InvoiceFlow không có login page. Để phân biệt user (admin vs staff)
 * mà không phá vỡ UX, dùng cơ chế:
 *
 *   1) `current_staff_id` cookie (HttpOnly false) — set bởi /zalo/accounts page.
 *      Mặc định khi không có cookie → "system" (id = null, role = admin để
 *      backward compat với code cũ).
 *   2) Hoặc `x-staff-id` header — cho testing / extension tự xác định.
 *
 * Helper:
 *   getCurrentStaff(req)        → { id, email, full_name, role, assignments[] }
 *   requireAdmin(req)           → throws 403 nếu role != admin
 *   canViewAccount(staff, id)   → true nếu admin hoặc staff assigned
 *   canSendToAccount(staff, id)
 *   canBroadcastTo(staff, id)
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

let _adminCache: { id: string | null; email: string | null; full_name: string | null } | null = null;

async function loadAdmin(): Promise<{ id: string | null; email: string | null; full_name: string | null }> {
  if (_adminCache) return _adminCache;
  if (!SUPABASE_URL || !KEY) {
    _adminCache = { id: null, email: null, full_name: null };
    return _adminCache;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/staff?role=eq.admin&limit=1`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`supabase ${res.status}`);
    const rows = (await res.json()) as Array<{ id: string; email: string; full_name: string }>;
    if (rows.length > 0) {
      _adminCache = { id: rows[0].id, email: rows[0].email, full_name: rows[0].full_name };
      return _adminCache;
    }
  } catch {
    /* fallback */
  }
  _adminCache = { id: null, email: null, full_name: null };
  return _adminCache;
}

export type StaffSession = {
  id: string | null;
  email: string;
  full_name: string;
  role: "admin" | "staff" | "system";
  assignments: Array<{ account_id: string; can_view: boolean; can_send: boolean; can_broadcast: boolean }>;
};

/**
 * Đọc staff session từ request.
 * - Cookie `current_staff_id` (ưu tiên)
 * - Header `x-staff-id` (testing / extension)
 * - Fallback: system admin (backward compat — không phá vỡ flow cũ)
 *
 * Lưu ý Phase 3: Hàm `requireStaffOrAdmin()` mới (dùng cho trang UI-sensitive)
 * sẽ trả null nếu KHÔNG có cookie → bắt buộc user phải đăng nhập. Còn
 * `getCurrentStaff()` vẫn fallback admin để các API cũ không vỡ.
 */
export async function getCurrentStaff(req: NextRequest): Promise<StaffSession> {
  const headerId = req.headers.get("x-staff-id") || null;
  const cookieId = req.cookies.get("current_staff_id")?.value || null;
  const staffId = cookieId || headerId;
  // Không có id → fallback system admin để code cũ hoạt động.
  if (!staffId) {
    const admin = await loadAdmin();
    return {
      id: admin.id,
      email: admin.email || "system@local",
      full_name: admin.full_name || "System",
      role: "admin",
      assignments: [] // admin không cần explicit assignment
    };
  }
  // Đã có id → fetch từ Supabase.
  if (!SUPABASE_URL || !KEY) {
    return {
      id: staffId,
      email: "",
      full_name: "Unknown",
      role: "staff",
      assignments: []
    };
  }
  try {
    const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
    const { data: staff } = await sb.from("staff").select("*").eq("id", staffId).maybeSingle();
    if (!staff) {
      return {
        id: staffId,
        email: "",
        full_name: "Unknown",
        role: "staff",
        assignments: []
      };
    }
    const { data: assignments } = await sb
      .from("staff_zalo_assignments")
      .select("account_id,can_view,can_send,can_broadcast")
      .eq("staff_id", staffId);
    return {
      id: staff.id,
      email: staff.email,
      full_name: staff.full_name,
      role: staff.role === "admin" ? "admin" : "staff",
      assignments: assignments || []
    };
  } catch {
    return {
      id: staffId,
      email: "",
      full_name: "Unknown",
      role: "staff",
      assignments: []
    };
  }
}

/**
 * Phiên bản strict: nếu KHÔNG có cookie/header → trả null thay vì fallback.
 * Caller dùng cho UI quan trọng cần biết rõ "user đã login hay chưa".
 */
export async function getCurrentStaffStrict(req: NextRequest): Promise<StaffSession | null> {
  const headerId = req.headers.get("x-staff-id") || null;
  const cookieId = req.cookies.get("current_staff_id")?.value || null;
  const staffId = cookieId || headerId;
  if (!staffId) return null;
  const staff = await getCurrentStaff(req);
  return staff.id ? staff : null;
}

/**
 * Yêu cầu quyền admin. Trả null nếu OK; trả NextResponse nếu 403.
 * Caller check: const guard = await requireAdmin(req); if (guard) return guard;
 */
export async function requireAdmin(req: NextRequest) {
  const staff = await getCurrentStaff(req);
  if (staff.role !== "admin") {
    return {
      error: Response.json({ error: "Admin only" }, { status: 403 })
    };
  }
  return { staff };
}

export function canViewAccount(staff: StaffSession, accountId: string): boolean {
  if (staff.role === "admin") return true;
  return staff.assignments.some((a) => a.account_id === accountId && a.can_view);
}

export function canSendToAccount(staff: StaffSession, accountId: string): boolean {
  if (staff.role === "admin") return true;
  return staff.assignments.some((a) => a.account_id === accountId && a.can_send);
}

export function canBroadcastTo(staff: StaffSession, accountId: string): boolean {
  if (staff.role === "admin") return true;
  return staff.assignments.some((a) => a.account_id === accountId && a.can_broadcast);
}

/**
 * Cookie options khi set current_staff_id.
 *
 * maxAge = 7 ngày: khi cookie hết hạn, browser tự xoá và không gửi lên nữa —
 * request kế tiếp tới bất kỳ route (dashboard) nào sẽ rơi vào nhánh
 * `if (!staffId)` ở middleware.ts, tự redirect về /login (không cần thêm
 * logic riêng cho "hết hạn" — hết hạn = như chưa từng đăng nhập).
 */
export const STAFF_COOKIE_NAME = "current_staff_id";

// STAFF_COOKIE_DOMAIN (optional, vd ".timetech.markeeai.com") — khi set, cookie
// đăng nhập dùng chung được cho MỌI subdomain, không riêng host đã login. Cần
// cho các module tách riêng (services/zalo-account-module,
// services/zalo-forward-module — deploy ở subdomain khác app chính) nhận được
// session đã đăng nhập ở app chính mà không cần login lại. Để trống (mặc định)
// thì cookie chỉ dùng được đúng host đã set — an toàn cho local dev (domain
// dạng ".x" không match được "localhost").
const STAFF_COOKIE_DOMAIN = process.env.STAFF_COOKIE_DOMAIN || undefined;

export const STAFF_COOKIE_OPTS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: false,
  maxAge: 60 * 60 * 24 * 7, // 7 ngày
  ...(STAFF_COOKIE_DOMAIN ? { domain: STAFF_COOKIE_DOMAIN } : {})
};