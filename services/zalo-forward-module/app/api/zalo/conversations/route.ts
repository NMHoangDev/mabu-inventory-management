/**
 * Ported nguyên văn từ app/api/zalo/conversations/route.ts (app chính) —
 * cache thread list vào zalo_conversations_ui, dùng cho phần chat mới của
 * module này. Không đổi logic gì.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

let _cachedKey: { key: string; isService: boolean } | null = null;

async function pickKey(): Promise<{ key: string; isService: boolean } | null> {
  if (_cachedKey) return _cachedKey;
  const candidates: { key: string; isService: boolean }[] = [];
  if (SUPABASE_SERVICE_ROLE_KEY) candidates.push({ key: SUPABASE_SERVICE_ROLE_KEY, isService: true });
  if (SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== SUPABASE_SERVICE_ROLE_KEY) {
    candidates.push({ key: SUPABASE_ANON_KEY, isService: false });
  }
  for (const c of candidates) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/zalo_conversations_ui?select=conversation_id&limit=1`, {
        headers: { apikey: c.key, Authorization: `Bearer ${c.key}` },
        next: { revalidate: 0 },
      });
      if (r.ok) {
        _cachedKey = c;
        return c;
      }
    } catch {
      // thử key tiếp theo
    }
  }
  return null;
}

function getSupabaseAdmin() {
  if (!SUPABASE_URL) throw new Error("Supabase URL missing");
  const key = _cachedKey?.key || SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!key) throw new Error("Supabase credentials missing");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

interface ConversationInput {
  conversation_id: string;
  thread_id?: string | null;
  thread_type?: string | null;
  conversation_name?: string | null;
  account_id?: string | null;
  avatar_url?: string | null;
  unread_count?: number | null;
  last_message_ts?: string | number | null;
  latest_message_at?: string | null;
  latest_content?: string | null;
  latest_sender_id?: string | null;
  latest_is_self?: boolean | null;
  message_count?: number | null;
  has_messages?: boolean | null;
  is_pinned?: boolean | null;
}

function toRow(c: ConversationInput, accountId: string) {
  const rawConvId = c.conversation_id || "";
  const normalizedConvId = rawConvId.replace(/^[ug]:/, "");
  const threadId = c.thread_id || normalizedConvId || (rawConvId.split(":")[1] ?? "");
  const threadType = c.thread_type || (rawConvId.startsWith("g:") ? "group" : "user");
  const ts = c.last_message_ts ? Number(c.last_message_ts) || null : null;
  return {
    account_id: accountId,
    thread_id: threadId,
    thread_type: threadType,
    conversation_id: normalizedConvId || threadId,
    conversation_name: c.conversation_name || (threadType === "group" ? `Group ${threadId}` : `Zalo ${threadId}`),
    avatar_url: c.avatar_url ?? null,
    unread_count: Number(c.unread_count || 0),
    last_message_ts: ts,
    latest_message_at: c.latest_message_at || null,
    latest_content: c.latest_content ?? null,
    latest_sender_id: c.latest_sender_id ?? null,
    latest_is_self: !!c.latest_is_self,
    message_count: Number(c.message_count || 0),
    has_messages: !!c.has_messages,
    is_pinned: !!c.is_pinned,
    updated_at: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const picked = await pickKey();
    if (!picked) return NextResponse.json({ conversations: [], total: 0, note: "no valid key" });
    const supabase = getSupabaseAdmin();
    const accountId = req.nextUrl.searchParams.get("account_id") || "shop-owner";
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 200), 1000);

    const { data, error } = await supabase
      .from("zalo_conversations_ui")
      .select("*")
      .eq("account_id", accountId)
      .order("last_message_ts", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) return NextResponse.json({ conversations: [], total: 0, note: error.message });

    return NextResponse.json({
      conversations: (data || []).map((r) => ({
        conversation_id: r.conversation_id,
        thread_id: r.thread_id,
        thread_type: r.thread_type,
        conversation_name: r.conversation_name,
        account_id: r.account_id,
        avatar_url: r.avatar_url,
        unread_count: r.unread_count,
        last_message_ts: r.last_message_ts,
        latest_message_at: r.latest_message_at,
        latest_content: r.latest_content,
        latest_sender_id: r.latest_sender_id,
        latest_is_self: r.latest_is_self,
        message_count: r.message_count,
        has_messages: r.has_messages,
        is_pinned: r.is_pinned,
      })),
      total: data?.length || 0,
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return NextResponse.json({ conversations: [], total: 0, note: err?.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const picked = await pickKey();
    if (!picked) return NextResponse.json({ ok: false, error: "no valid key", upserted: 0 }, { status: 200 });
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const conversations: ConversationInput[] = Array.isArray(body?.conversations) ? body.conversations : [];
    const accountId: string = body?.account_id || "shop-owner";

    if (conversations.length === 0) return NextResponse.json({ ok: true, upserted: 0 });

    const rows = conversations.filter((c) => c?.conversation_id).map((c) => toRow(c, accountId));
    const dbSafeRows = rows.map((r) => {
      const out: Record<string, unknown> = { ...r };
      if (out.last_message_ts == null) delete out.last_message_ts;
      if (out.latest_message_at == null) delete out.latest_message_at;
      return out;
    });
    const { data, error } = await supabase
      .from("zalo_conversations_ui")
      .upsert(dbSafeRows, { onConflict: "account_id,conversation_id", ignoreDuplicates: false })
      .select("conversation_id");

    if (error) return NextResponse.json({ ok: false, error: error.message, upserted: 0 }, { status: 200 });

    return NextResponse.json({ ok: true, upserted: data?.length || rows.length });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return NextResponse.json({ ok: false, error: err?.message }, { status: 200 });
  }
}
