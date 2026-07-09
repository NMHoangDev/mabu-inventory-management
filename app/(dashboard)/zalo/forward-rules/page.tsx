/**
 * Trang cấu hình "Nhóm chính" auto-forward: tin nhắn gửi trong 1 nhóm Zalo
 * được chọn làm nhóm chính sẽ tự động chuyển tiếp sang các nhóm đích khác.
 *
 * SSR chỉ để xác định role (admin/staff) hiển thị nút tạo/sửa/xoá — enforcement
 * thực sự nằm ở API route (app/api/zalo/forward-rules), theo đúng pattern của
 * trang /zalo/accounts.
 */

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { STAFF_COOKIE_NAME } from "@/lib/zalo/auth";
import ZaloForwardRulesDashboard from "@/components/zalo/ZaloForwardRulesDashboard";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

async function loadRole(): Promise<"admin" | "staff"> {
  if (!SUPABASE_URL || !KEY) return "admin";
  try {
    const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
    const cookieStore = await cookies();
    const currentStaffId = cookieStore.get(STAFF_COOKIE_NAME)?.value || null;
    if (!currentStaffId) return "admin"; // fallback system admin — backward compat
    const { data: staff } = await sb
      .from("staff")
      .select("role")
      .eq("id", currentStaffId)
      .maybeSingle();
    return staff?.role === "admin" ? "admin" : "staff";
  } catch {
    return "admin";
  }
}

export const dynamic = "force-dynamic";

export default async function ZaloForwardRulesPage() {
  const role = await loadRole();
  return <ZaloForwardRulesDashboard role={role} />;
}
