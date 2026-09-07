/**
 * GET /api/campaigns/[id]/logs?limit=  — lịch sử gửi (mới nhất trước).
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff, canViewAccount } from "@/lib/zaloAuth";

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

async function loadCampaign(id: string) {
  const res = await sb(`/zalo_campaigns?id=eq.${encodeURIComponent(id)}&select=id,account_id`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!SUPABASE_URL || !KEY) return NextResponse.json({ logs: [], error: "supabase_unconfigured" });

  const campaign = await loadCampaign(id);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const staff = await getCurrentStaff(req);
  if (!canViewAccount(staff, campaign.account_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limitParam = Number(req.nextUrl.searchParams.get("limit")) || 50;
  const limit = Math.min(Math.max(1, limitParam), 200);

  const res = await sb(
    `/zalo_campaign_logs?campaign_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc&limit=${limit}`
  );
  const logs = res.ok ? await res.json() : [];
  return NextResponse.json({ logs });
}
