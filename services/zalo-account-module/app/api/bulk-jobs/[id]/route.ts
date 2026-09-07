/**
 * GET    /api/bulk-jobs/[id]  — chi tiết job + tối đa 500 item gần nhất
 * PATCH  /api/bulk-jobs/[id]  — { status: "paused"|"running"|"cancelled" }
 * DELETE /api/bulk-jobs/[id]  — xoá job (cascade xoá luôn zalo_bulk_job_items)
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff, canBroadcastTo } from "@/lib/zaloAuth";

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

async function loadJob(id: string) {
  const res = await sb(`/zalo_bulk_jobs?id=eq.${encodeURIComponent(id)}&select=*`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!SUPABASE_URL || !KEY) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 500 });

    const job = await loadJob(id);
    if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const staff = await getCurrentStaff(req);
    if (!canBroadcastTo(staff, job.account_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const itemsRes = await sb(`/zalo_bulk_job_items?job_id=eq.${id}&select=*&order=id.asc&limit=500`);
    const items = itemsRes.ok ? await itemsRes.json() : [];
    return NextResponse.json({ job, items });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err?.message || "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!SUPABASE_URL || !KEY) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 500 });

    const job = await loadJob(id);
    if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const staff = await getCurrentStaff(req);
    if (staff.role !== "admin" && !canBroadcastTo(staff, job.account_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const status = String(body?.status || "");
    if (!["paused", "running", "cancelled"].includes(status)) {
      return NextResponse.json({ error: "status không hợp lệ" }, { status: 400 });
    }
    // Worker chỉ nhặt job status IN ('pending','running') — resume từ 'paused' phải về 'running'.
    const res = await sb(`/zalo_bulk_jobs?id=eq.${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ status })
    });
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 });
    const [updated] = await res.json();
    return NextResponse.json({ job: updated });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err?.message || "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!SUPABASE_URL || !KEY) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 500 });

    const job = await loadJob(id);
    if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const staff = await getCurrentStaff(req);
    if (staff.role !== "admin" && !canBroadcastTo(staff, job.account_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const res = await sb(`/zalo_bulk_jobs?id=eq.${id}`, { method: "DELETE" });
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err?.message || "internal_error" }, { status: 500 });
  }
}
