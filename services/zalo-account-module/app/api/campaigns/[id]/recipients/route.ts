/**
 * GET  /api/campaigns/[id]/recipients?status=&limit=  — danh sách người nhận.
 * POST /api/campaigns/[id]/recipients                  — thêm THÊM người nhận
 *                                                          vào chiến dịch đã có.
 *
 * Body POST: { phones: string[] }
 *
 * Không có yêu cầu quyền riêng cho route này trong hợp đồng gốc — áp dụng
 * cùng quy tắc với các route campaigns khác cho nhất quán: canViewAccount cho
 * GET (chỉ xem), admin/canBroadcastTo cho POST (thao tác ghi).
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff, canViewAccount, canBroadcastTo } from "@/lib/zaloAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function sb(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    cache: "no-store",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...(init?.headers ?? {}) }
  });
}

/** "0839108906, 0912345678\n0987654321" → ["84839108906","84912345678","84987654321"] (chuẩn hoá + khử trùng). */
function normalizePhones(raw: unknown): string[] {
  const text = Array.isArray(raw) ? raw.join("\n") : String(raw || "");
  const seen = new Set<string>();
  for (const token of text.split(/[\s,;]+/)) {
    const digits = token.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 12) continue;
    const normalized = digits.startsWith("0") ? "84" + digits.slice(1) : digits;
    seen.add(normalized);
  }
  return Array.from(seen);
}

async function loadCampaign(id: string) {
  const res = await sb(`/zalo_campaigns?id=eq.${encodeURIComponent(id)}&select=id,account_id`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!SUPABASE_URL || !KEY) return NextResponse.json({ recipients: [], error: "supabase_unconfigured" });

    const campaign = await loadCampaign(id);
    if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const staff = await getCurrentStaff(req);
    if (!canViewAccount(staff, campaign.account_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const status = req.nextUrl.searchParams.get("status") || "";
    const limitParam = Number(req.nextUrl.searchParams.get("limit")) || 200;
    const limit = Math.min(Math.max(1, limitParam), 1000);
    const filter = status ? `&status=eq.${encodeURIComponent(status)}` : "";

    const res = await sb(
      `/zalo_campaign_recipients?campaign_id=eq.${encodeURIComponent(id)}&select=*&order=id.asc&limit=${limit}${filter}`
    );
    const recipients = res.ok ? await res.json() : [];
    return NextResponse.json({ recipients });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ recipients: [], error: err?.message || "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!SUPABASE_URL || !KEY) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 500 });

    const campaign = await loadCampaign(id);
    if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const staff = await getCurrentStaff(req);
    if (staff.role !== "admin" && !canBroadcastTo(staff, campaign.account_id)) {
      return NextResponse.json({ error: "Bạn không có quyền thêm người nhận cho chiến dịch này" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const phones = normalizePhones(body?.phones);
    if (phones.length === 0) return NextResponse.json({ error: "Danh sách số điện thoại trống hoặc không hợp lệ" }, { status: 400 });
    if (phones.length > 2000) {
      return NextResponse.json({ error: "Tối đa 2000 số/lần — chia nhỏ danh sách để an toàn hơn cho tài khoản" }, { status: 400 });
    }

    const rows = phones.map((phone) => ({ campaign_id: Number(id), phone, status: "pending" }));
    const res = await sb(`/zalo_campaign_recipients?on_conflict=campaign_id,phone`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(rows)
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || `supabase ${res.status}` }, { status: 500 });
    }

    // PostgREST với Prefer: resolution=ignore-duplicates + return=minimal không trả
    // về danh sách dòng thực sự mới được tạo (số đã tồn tại bị bỏ qua âm thầm) —
    // trả về số đã chuẩn hoá/khử trùng gửi lên như một ước tính best-effort.
    return NextResponse.json({ added: phones.length });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err?.message || "internal_error" }, { status: 500 });
  }
}
