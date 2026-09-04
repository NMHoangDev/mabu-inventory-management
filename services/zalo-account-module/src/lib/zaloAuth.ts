/**
 * src/lib/zaloAuth.ts — ported nguyên văn từ lib/zalo/auth.ts của app chính
 * (InvoiceFlow Manager). Giữ đúng hành vi gốc: cookie `current_staff_id`
 * (ưu tiên) hoặc header `x-staff-id`, fallback về "system admin" khi không
 * có id nào (backward compat với các route cũ tin cậy fallback này).
 *
 * Module này không có login page riêng — cookie được set bởi app chính,
 * module chỉ đọc lại để authorize.
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

export const STAFF_COOKIE_NAME = "current_staff_id";
export const STAFF_COOKIE_OPTS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: false,
  maxAge: 60 * 60 * 24 * 7 // 7 ngày
};
