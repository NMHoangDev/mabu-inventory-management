import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/admin/zalo/fix-is-sent
// Body: { thread_id?: string, dry_run?: boolean }
// Infer is_sent từ sender_id: nếu sender_id != thread_id thì is_sent = true
// (giả định: mình gửi tin có sender_id là ID của mình, khác thread_id).
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const threadId: string | null = body?.thread_id ?? null;
    const dryRun: boolean = body?.dry_run !== false;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase credentials" },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Lấy tất cả rows (hoặc filter theo thread_id nếu có)
    let query = supabase
      .from("zalo_messages")
      .select("id,thread_id,sender_id,is_sent,source_message_id");
    if (threadId) query = query.eq("thread_id", threadId);
    query = query.limit(5000);
    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const updates: Array<{ id: string; sender_id: string; thread_id: string; old_is_sent: boolean; new_is_sent: boolean }> = [];
    for (const row of data || []) {
      if (!row.sender_id || !row.thread_id) continue;
      // Mình gửi khi sender_id != thread_id; đối phương gửi khi sender_id == thread_id
      const inferredIsSent = row.sender_id !== row.thread_id;
      if (inferredIsSent !== row.is_sent) {
        updates.push({
          id: row.id,
          sender_id: row.sender_id,
          thread_id: row.thread_id,
          old_is_sent: row.is_sent,
          new_is_sent: inferredIsSent,
        });
      }
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        proposed_updates: updates.length,
        sample: updates.slice(0, 10),
      });
    }

    // Thực sự update từng row
    let updated = 0;
    for (const u of updates) {
      const { error: upErr } = await supabase
        .from("zalo_messages")
        .update({ is_sent: u.new_is_sent })
        .eq("id", u.id);
      if (!upErr) updated += 1;
    }

    return NextResponse.json({ ok: true, updated, total_proposed: updates.length });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}