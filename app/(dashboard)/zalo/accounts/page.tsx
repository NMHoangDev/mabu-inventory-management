/**
 * Trang quản lý tài khoản Zalo: danh sách, tạo mới, gán nhân viên.
 *
 * Phase 3 — multi-account auth:
 *   - Hiển thị TẤT CẢ account (admin) hoặc chỉ account assigned (staff).
 *   - Admin có thể: tạo tài khoản mới, đổi tên, xoá, gán staff.
 *   - Staff chỉ xem thông tin + status runtime.
 *
 * Dùng server component để check role + filter ở SSR; tab bên trong là client.
 */

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { STAFF_COOKIE_NAME } from "@/lib/zalo/auth";
import ZaloAccountsDashboard from "@/components/zalo/ZaloAccountsDashboard";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

async function loadInitialData() {
  if (!SUPABASE_URL || !KEY) {
    return { staff: null, accounts: [], staffList: [], assignments: [] };
  }
  const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
  // Lấy staff từ cookie (do SSR — Next 15 cần await cookies()).
  const cookieStore = await cookies();
  const currentStaffId = cookieStore.get(STAFF_COOKIE_NAME)?.value || null;

  const [staffRes, accountsRes, staffListRes, assignmentsRes] = await Promise.all([
    currentStaffId
      ? sb.from("staff").select("*").eq("id", currentStaffId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.from("zalo_accounts").select("*").order("created_at"),
    sb.from("staff").select("*").order("created_at"),
    sb.from("staff_zalo_assignments").select("*")
  ]);

  let role: "admin" | "staff" | "system" = "system";
  let staff = staffRes.data;
  if (staff && staff.role === "admin") role = "admin";
  else if (staff) role = "staff";

  // Nếu không có cookie → fallback admin (backward compat).
  if (!staff) role = "admin";

  let accounts = accountsRes.data || [];
  let assignments = assignmentsRes.data || [];
  // Staff chỉ xem được account trong assignments của mình.
  if (role === "staff" && staff) {
    const allowed = new Set(
      assignments.filter((a: any) => a.staff_id === staff.id).map((a: any) => a.account_id)
    );
    accounts = accounts.filter((a: any) => allowed.has(a.account_id));
    // Cũng filter assignment rows để chỉ show của staff này.
    assignments = assignments.filter((a: any) => a.staff_id === staff.id);
  }
  return {
    staff,
    accounts,
    staffList: staffListRes.data || [],
    assignments,
    role
  };
}

export const dynamic = "force-dynamic";

export default async function ZaloAccountsPage() {
  // Đơn giản: cho phép mở trang kể cả khi chưa login (cookie system fallback).
  const data = await loadInitialData();
  return <ZaloAccountsDashboard initialData={data} />;
}