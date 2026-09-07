/**
 * GET  /api/bulk-jobs?account_id=          — danh sách job (mới nhất trước).
 * POST /api/bulk-jobs                      — tạo job mới + danh sách số điện
 *                                             thoại (worker/automationWorker.js
 *                                             xử lý dần, xem file đó để biết
 *                                             đúng hợp đồng dữ liệu).
 *
 * Body POST: {
 *   account_id, job_type: "send_message"|"add_friend"|"invite_group",
 *   message?, image_urls?: string[],
 *   target_group_id?, target_group_name?,   // bắt buộc nếu job_type=invite_group
 *   delay_seconds_min?, delay_seconds_max?,
 *   phones: string[]                        // 1 số/dòng, đã lọc ở client hoặc để server tự lọc
 * }
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

export async function GET(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !KEY) return NextResponse.json({ jobs: [], error: "supabase_unconfigured" });
    const accountId = req.nextUrl.searchParams.get("account_id") || "";
    const staff = await getCurrentStaff(req);
    if (accountId && !canBroadcastTo(staff, accountId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const filter = accountId ? `&account_id=eq.${encodeURIComponent(accountId)}` : "";
    const res = await sb(`/zalo_bulk_jobs?select=*&order=created_at.desc&limit=50${filter}`);
    const jobs = res.ok ? await res.json() : [];
    return NextResponse.json({ jobs });
  } catch (e) {
    const err = e as { message?: string };
    // LUÔN trả JSON kể cả khi lỗi bất ngờ (Supabase self-host chập chờn...) —
    // thiếu try/catch ở đây từng khiến lỗi thoát ra ngoài thành trang HTML mặc
    // định của Next.js, làm client (poll liên tục ở trang gửi hàng loạt) nhận
    // "Unexpected token '<'... is not valid JSON" thay vì thông báo rõ ràng.
    return NextResponse.json({ jobs: [], error: err?.message || "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !KEY) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const accountId = String(body?.account_id || "").trim();
    const jobType = String(body?.job_type || "");
    if (!accountId) return NextResponse.json({ error: "account_id là bắt buộc" }, { status: 400 });
    if (!["send_message", "add_friend", "invite_group"].includes(jobType)) {
      return NextResponse.json({ error: "job_type không hợp lệ" }, { status: 400 });
    }
    if (jobType === "invite_group" && !body?.target_group_id) {
      return NextResponse.json({ error: "target_group_id là bắt buộc khi mời vào nhóm" }, { status: 400 });
    }

    const staff = await getCurrentStaff(req);
    if (staff.role !== "admin" && !canBroadcastTo(staff, accountId)) {
      return NextResponse.json({ error: "Bạn không có quyền tạo chiến dịch gửi hàng loạt cho tài khoản này" }, { status: 403 });
    }

    const phones = normalizePhones(body?.phones);
    if (phones.length === 0) return NextResponse.json({ error: "Danh sách số điện thoại trống hoặc không hợp lệ" }, { status: 400 });
    if (phones.length > 2000) {
      return NextResponse.json({ error: "Tối đa 2000 số/lần — chia nhỏ danh sách để an toàn hơn cho tài khoản" }, { status: 400 });
    }

    const delayMin = Math.max(2, Number(body?.delay_seconds_min) || 2);
    const delayMax = Math.max(delayMin, Number(body?.delay_seconds_max) || 10);

    const jobRow = {
      account_id: accountId,
      job_type: jobType,
      status: "pending",
      message: body?.message ? String(body.message) : null,
      image_urls: Array.isArray(body?.image_urls) ? body.image_urls : [],
      target_group_id: body?.target_group_id ? String(body.target_group_id) : null,
      target_group_name: body?.target_group_name ? String(body.target_group_name) : null,
      delay_seconds_min: delayMin,
      delay_seconds_max: delayMax,
      total_count: phones.length,
      created_by: staff.id || null
    };

    const jobRes = await sb("/zalo_bulk_jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(jobRow)
    });
    if (!jobRes.ok) {
      const text = await jobRes.text();
      return NextResponse.json({ error: text || `supabase ${jobRes.status}` }, { status: 500 });
    }
    const [job] = await jobRes.json();

    const itemRows = phones.map((phone) => ({ job_id: job.id, phone }));
    const itemsRes = await sb("/zalo_bulk_job_items", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(itemRows)
    });
    if (!itemsRes.ok) {
      const text = await itemsRes.text();
      await sb(`/zalo_bulk_jobs?id=eq.${job.id}`, { method: "DELETE" });
      return NextResponse.json({ error: `Tạo danh sách số thất bại, đã hủy job: ${text || itemsRes.status}` }, { status: 500 });
    }

    return NextResponse.json({ job });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err?.message || "internal_error" }, { status: 500 });
  }
}
