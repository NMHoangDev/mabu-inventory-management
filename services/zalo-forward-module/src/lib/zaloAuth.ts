/**
 * Port nguyên logic từ D:\InvoiceFlowManager\lib\zalo\auth.ts — không import
 * chéo được giữa 2 Next.js project riêng biệt nên nhân bản (~150 dòng, chấp
 * nhận trùng lặp nhỏ để module thật sự độc lập). Có sửa gì ở bản gốc thì nhớ
 * đồng bộ lại đây.
 */
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

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

export async function getCurrentStaff(req: NextRequest): Promise<StaffSession> {
  const headerId = req.headers.get("x-staff-id") || null;
  const cookieId = req.cookies.get("current_staff_id")?.value || null;
  const staffId = cookieId || headerId;
  if (!staffId) {
    const admin = await loadAdmin();
    return {
      id: admin.id,
      email: admin.email || "system@local",
      full_name: admin.full_name || "System",
      role: "admin",
      assignments: []
    };
  }
  if (!SUPABASE_URL || !KEY) {
    return { id: staffId, email: "", full_name: "Unknown", role: "staff", assignments: [] };
  }
  try {
    const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
    const { data: staff } = await sb.from("staff").select("*").eq("id", staffId).maybeSingle();
    if (!staff) {
      return { id: staffId, email: "", full_name: "Unknown", role: "staff", assignments: [] };
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
    return { id: staffId, email: "", full_name: "Unknown", role: "staff", assignments: [] };
  }
}

/**
 * Phiên bản strict: nếu KHÔNG có cookie/header → trả null thay vì fallback
 * admin. Dùng cho route login (biết rõ "đã đăng nhập hay chưa").
 */
export async function getCurrentStaffStrict(req: NextRequest): Promise<StaffSession | null> {
  const headerId = req.headers.get("x-staff-id") || null;
  const cookieId = req.cookies.get("current_staff_id")?.value || null;
  const staffId = cookieId || headerId;
  if (!staffId) return null;
  const staff = await getCurrentStaff(req);
  return staff.id ? staff : null;
}

export async function requireAdmin(req: NextRequest) {
  const staff = await getCurrentStaff(req);
  if (staff.role !== "admin") {
    return { error: Response.json({ error: "Admin only" }, { status: 403 }) };
  }
  return { staff };
}

export function canViewAccount(staff: StaffSession, accountId: string): boolean {
  if (staff.role === "admin") return true;
  return staff.assignments.some((a) => a.account_id === accountId && a.can_view);
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
