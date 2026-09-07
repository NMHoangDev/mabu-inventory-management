/**
 * Trang "Chuyển tiếp" — port từ app/(dashboard)/page.tsx của
 * services/zalo-forward-module. SSR chỉ để xác định role hiển thị nút
 * tạo/sửa/xoá — enforcement thật nằm ở API route. Khác bản gốc: đọc
 * ?accountId= (module này đa tài khoản, vào từ nút "Chuyển tiếp" ở từng dòng
 * tài khoản trong trang "Tài khoản Zalo").
 */
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { STAFF_COOKIE_NAME } from "@/lib/zaloAuth";
import ForwardRulesDashboard from "@/components/ForwardRulesDashboard";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

async function loadRole(): Promise<"admin" | "staff"> {
  if (!SUPABASE_URL || !KEY) return "admin";
  try {
    const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
    const cookieStore = await cookies();
    const currentStaffId = cookieStore.get(STAFF_COOKIE_NAME)?.value || null;
    if (!currentStaffId) return "admin";
    const { data: staff } = await sb.from("staff").select("role").eq("id", currentStaffId).maybeSingle();
    return staff?.role === "admin" ? "admin" : "staff";
  } catch {
    return "admin";
  }
}

export const dynamic = "force-dynamic";

export default async function ForwardRulesPage({
  searchParams
}: {
  searchParams: Promise<{ accountId?: string }>;
}) {
  const [role, params] = await Promise.all([loadRole(), searchParams]);
  return <ForwardRulesDashboard role={role} accountId={params.accountId} />;
}
