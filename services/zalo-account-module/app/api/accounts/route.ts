/**
 * GET  /api/accounts
 * POST /api/accounts
 *
 * Ported từ app/api/zalo/accounts/route.ts (app chính). Proxy tới
 * zalo-bridge — bridge là source-of-truth về runtime status; Supabase chỉ
 * mirror metadata.
 *
 * - Admin xem tất cả account.
 * - Staff chỉ thấy account có trong staff_zalo_assignments (canViewAccount).
 * - POST yêu cầu admin (chỉ admin mới tạo tài khoản mới).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff, canViewAccount } from "@/lib/zaloAuth";
import { bridgeFetch } from "@/lib/bridge";
import { SUPABASE_URL, SUPABASE_KEY, isSupabaseConfigured } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function mirrorToSupabase(account: Record<string, unknown> | undefined) {
  if (!account) return;
  if (!isSupabaseConfigured()) return;
  const row = {
    account_id: String(account.account_id),
    display_name: String(account.display_name ?? account.account_id),
    status: String(account.status ?? "disconnected"),
    zalo_user_id: (account.zalo_user_id as string | null) || null,
    zalo_display_name: (account.zalo_display_name as string | null) || null,
    last_seen_at: (account.last_seen_at as string | null) || null,
    updated_at: new Date().toISOString()
  };
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/zalo_accounts`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(row)
    });
  } catch {
    /* swallow */
  }
}

export async function GET(req: NextRequest) {
  try {
    const staff = await getCurrentStaff(req);
    const res = await bridgeFetch("/auth/accounts");
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { accounts: [], error: text || `bridge ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    let accounts = Array.isArray(data?.accounts) ? data.accounts : [];
    if (staff.role !== "admin") {
      accounts = accounts.filter((a: { account_id: string }) => canViewAccount(staff, a.account_id));
    }
    return NextResponse.json({ accounts });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json(
      { accounts: [], error: err?.message ?? "Bridge unreachable" },
      { status: 200 } // 200 để FE fallback an toàn khi bridge down
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const staff = await getCurrentStaff(req);
    if (staff.role !== "admin") {
      return NextResponse.json({ error: "Chỉ admin mới có thể tạo tài khoản Zalo" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const res = await bridgeFetch("/auth/accounts", {
      method: "POST",
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error ?? `bridge ${res.status}` }, { status: res.status });
    }
    // Đồng thời upsert vào Supabase để lần sau GET trực tiếp Supabase vẫn thấy.
    // Best-effort, không block response.
    void mirrorToSupabase(data.account).catch(() => undefined);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err?.message ?? "Bridge unreachable" }, { status: 500 });
  }
}
