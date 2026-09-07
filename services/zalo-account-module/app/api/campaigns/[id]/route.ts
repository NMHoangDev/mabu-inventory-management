/**
 * GET    /api/campaigns/[id]  — chi tiết chiến dịch + thống kê người nhận theo
 *                                status + 20 log gần nhất.
 * PATCH  /api/campaigns/[id]  — cập nhật 1 phần cấu hình chiến dịch (lịch, giãn
 *                                cách, giới hạn/ngày, nội dung, bật/tắt...).
 * DELETE /api/campaigns/[id]  — xoá chiến dịch (cascade xoá luôn recipients+logs).
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff, canViewAccount, canBroadcastTo } from "@/lib/zaloAuth";
import type { MessageTemplate } from "@/lib/types";

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
  const res = await sb(`/zalo_campaigns?id=eq.${encodeURIComponent(id)}&select=*`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

/** Đếm nhanh qua Content-Range (Prefer: count=exact + HEAD) — không cần tải dữ liệu. */
async function countRecipients(campaignId: string, status?: string): Promise<number> {
  const filter = status ? `&status=eq.${encodeURIComponent(status)}` : "";
  const res = await sb(`/zalo_campaign_recipients?campaign_id=eq.${encodeURIComponent(campaignId)}&select=id${filter}`, {
    method: "HEAD",
    headers: { Prefer: "count=exact" }
  });
  const range = res.headers.get("content-range"); // vd "0-0/23" hoặc "*/0"
  if (!range) return 0;
  const total = range.split("/")[1];
  return total ? Number(total) || 0 : 0;
}

function normalizeDaysOfWeek(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
}

function normalizeMessageTemplates(raw: unknown): MessageTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => ({
      text: String((t as { text?: unknown })?.text || ""),
      image_urls: Array.isArray((t as { image_urls?: unknown })?.image_urls)
        ? ((t as { image_urls: unknown[] }).image_urls.map(String))
        : []
    }))
    .filter((t) => t.text.trim().length > 0 || t.image_urls.length > 0);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!SUPABASE_URL || !KEY) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 500 });

  const campaign = await loadCampaign(id);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const staff = await getCurrentStaff(req);
  if (!canViewAccount(staff, campaign.account_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [total, pending, sent, failed, notFound] = await Promise.all([
    countRecipients(id),
    countRecipients(id, "pending"),
    countRecipients(id, "sent"),
    countRecipients(id, "failed"),
    countRecipients(id, "not_found")
  ]);

  const logsRes = await sb(
    `/zalo_campaign_logs?campaign_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc&limit=20`
  );
  const recent_logs = logsRes.ok ? await logsRes.json() : [];

  return NextResponse.json({
    campaign,
    stats: { total, pending, sent, failed, not_found: notFound },
    recent_logs
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!SUPABASE_URL || !KEY) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 500 });

  const campaign = await loadCampaign(id);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const staff = await getCurrentStaff(req);
  if (staff.role !== "admin" && !canBroadcastTo(staff, campaign.account_id)) {
    return NextResponse.json({ error: "Bạn không có quyền chỉnh sửa chiến dịch này" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body?.name !== undefined) patch.name = String(body.name).trim();
  if (body?.is_enabled !== undefined) patch.is_enabled = Boolean(body.is_enabled);
  if (body?.start_time !== undefined) patch.start_time = String(body.start_time);
  if (body?.end_time !== undefined) patch.end_time = String(body.end_time);
  if (body?.days_of_week !== undefined) patch.days_of_week = normalizeDaysOfWeek(body.days_of_week);
  // Sàn 2s — dưới mức này rủi ro khoá tài khoản tăng mạnh (xem cảnh báo trên UI).
  if (body?.interval_seconds_min !== undefined) patch.interval_seconds_min = Math.max(2, Number(body.interval_seconds_min) || 2);
  if (body?.interval_seconds_max !== undefined) patch.interval_seconds_max = Math.max(2, Number(body.interval_seconds_max) || 2);
  if (body?.daily_limit !== undefined) patch.daily_limit = Math.max(0, Number(body.daily_limit) || 0);
  if (body?.message_templates !== undefined) patch.message_templates = normalizeMessageTemplates(body.message_templates);

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Không có trường nào để cập nhật" }, { status: 400 });
  }

  const res = await sb(`/zalo_campaigns?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 });
  const [updated] = await res.json();
  return NextResponse.json({ campaign: updated });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!SUPABASE_URL || !KEY) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 500 });

  const campaign = await loadCampaign(id);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const staff = await getCurrentStaff(req);
  if (staff.role !== "admin" && !canBroadcastTo(staff, campaign.account_id)) {
    return NextResponse.json({ error: "Bạn không có quyền xoá chiến dịch này" }, { status: 403 });
  }

  const res = await sb(`/zalo_campaigns?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 });
  return NextResponse.json({ ok: true });
}
