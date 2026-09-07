/**
 * GET  /api/campaigns?account_id=          — danh sách chiến dịch (mới nhất trước).
 * POST /api/campaigns                      — tạo chiến dịch mới + danh sách người
 *                                             nhận (số điện thoại). worker/
 *                                             automationWorker.js (processCampaignOnce)
 *                                             xử lý lặp lịch hàng ngày, xem file đó
 *                                             để biết đúng hợp đồng dữ liệu.
 *
 * Body POST: {
 *   account_id, name,
 *   start_time?, end_time?, days_of_week?: number[],
 *   interval_seconds_min?, interval_seconds_max?, daily_limit?,
 *   message_templates?: Array<{ text: string; image_urls?: string[] }>,
 *   phones: string[]                        // 1 số/dòng, server tự chuẩn hoá + khử trùng
 * }
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

function normalizeDaysOfWeek(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [1, 2, 3, 4, 5, 6, 7];
  const days = raw
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  return days.length > 0 ? Array.from(new Set(days)) : [1, 2, 3, 4, 5, 6, 7];
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

export async function GET(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !KEY) return NextResponse.json({ campaigns: [], error: "supabase_unconfigured" });
    const accountId = req.nextUrl.searchParams.get("account_id") || "";
    const staff = await getCurrentStaff(req);
    if (accountId && !canViewAccount(staff, accountId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const filter = accountId ? `&account_id=eq.${encodeURIComponent(accountId)}` : "";
    const res = await sb(`/zalo_campaigns?select=*&order=created_at.desc&limit=50${filter}`);
    const campaigns = res.ok ? await res.json() : [];
    return NextResponse.json({ campaigns });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ campaigns: [], error: err?.message || "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !KEY) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const accountId = String(body?.account_id || "").trim();
    const name = String(body?.name || "").trim();
    if (!accountId) return NextResponse.json({ error: "account_id là bắt buộc" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "name là bắt buộc" }, { status: 400 });

    const staff = await getCurrentStaff(req);
    if (staff.role !== "admin" && !canBroadcastTo(staff, accountId)) {
      return NextResponse.json({ error: "Bạn không có quyền tạo chiến dịch cho tài khoản này" }, { status: 403 });
    }

    const phones = normalizePhones(body?.phones);
    if (phones.length === 0) return NextResponse.json({ error: "Danh sách số điện thoại trống hoặc không hợp lệ" }, { status: 400 });
    if (phones.length > 2000) {
      return NextResponse.json({ error: "Tối đa 2000 số/lần — chia nhỏ danh sách để an toàn hơn cho tài khoản" }, { status: 400 });
    }

    const intervalMin = Math.max(2, Number(body?.interval_seconds_min) || 2);
    const intervalMax = Math.max(intervalMin, Number(body?.interval_seconds_max) || 10);
    const dailyLimit = Math.max(1, Number(body?.daily_limit) || 50);

    const campaignRow = {
      account_id: accountId,
      name,
      start_time: body?.start_time ? String(body.start_time) : "09:00",
      end_time: body?.end_time ? String(body.end_time) : "17:00",
      days_of_week: normalizeDaysOfWeek(body?.days_of_week),
      interval_seconds_min: intervalMin,
      interval_seconds_max: intervalMax,
      daily_limit: dailyLimit,
      message_templates: normalizeMessageTemplates(body?.message_templates),
      created_by: staff.id || null
    };

    const campaignRes = await sb("/zalo_campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(campaignRow)
    });
    if (!campaignRes.ok) {
      const text = await campaignRes.text();
      return NextResponse.json({ error: text || `supabase ${campaignRes.status}` }, { status: 500 });
    }
    const [campaign] = await campaignRes.json();

    const recipientRows = phones.map((phone) => ({ campaign_id: campaign.id, phone, status: "pending" }));
    const recipientsRes = await sb("/zalo_campaign_recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(recipientRows)
    });
    if (!recipientsRes.ok) {
      const text = await recipientsRes.text();
      await sb(`/zalo_campaigns?id=eq.${campaign.id}`, { method: "DELETE" });
      return NextResponse.json(
        { error: `Tạo danh sách người nhận thất bại, đã hủy chiến dịch: ${text || recipientsRes.status}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ campaign });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err?.message || "internal_error" }, { status: 500 });
  }
}
