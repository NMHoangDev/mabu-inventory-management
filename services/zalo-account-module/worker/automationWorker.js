/**
 * Worker nền (chạy trong CÙNG process với Next.js — xem server.js) cho 2 tính
 * năng tự động của "Quản lý Zalo tập trung":
 *
 *   1) Gửi hàng loạt theo danh sách SỐ ĐIỆN THOẠI (bảng zalo_bulk_jobs +
 *      zalo_bulk_job_items) — chạy 1 lần cho tới khi hết danh sách.
 *   2) Chiến dịch nhắn tin tự động LẶP LỊCH hàng ngày (bảng zalo_campaigns +
 *      zalo_campaign_recipients + zalo_campaign_logs) — giờ gửi, tần suất,
 *      giãn cách, giới hạn/ngày, xoay vòng nội dung + chèn tên khách.
 *
 * Cả 2 đều gọi bridge qua endpoint /action/{send-by-phone,add-friend-by-phone,
 * invite-group-by-phone} (xem services/zalo-bridge/src/routes/zalo-client.js)
 * — bridge tự tra số điện thoại ra uid rồi thực hiện hành động.
 *
 * AN TOÀN TÀI KHOẢN: mọi hành động đều giãn cách ngẫu nhiên trong khoảng
 * [min,max] giây do người dùng cấu hình — Zalo phát hiện và khoá tài khoản cá
 * nhân gửi hàng loạt/kết bạn hàng loạt quá nhanh. Worker KHÔNG tự đặt giới hạn
 * cứng — trách nhiệm chọn giá trị an toàn thuộc về người cấu hình job/chiến
 * dịch (UI có gợi ý mặc định thận trọng).
 *
 * Thiết kế "không state trong RAM": mọi mốc thời gian (lần xử lý cuối) đọc lại
 * từ DB (processed_at của item gần nhất / last_sent_at của campaign) thay vì
 * giữ Map trong bộ nhớ — worker restart (deploy, crash) không làm mất nhịp
 * giãn cách hay gửi dồn dập ngay sau khi khởi động lại.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const BRIDGE_URL = process.env.ZALO_BRIDGE_URL || "http://localhost:3001";
const TICK_INTERVAL_MS = Number(process.env.AUTOMATION_TICK_INTERVAL_MS || 5000);

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  _client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  return _client;
}

function log(...args) {
  console.log(`[automation-worker ${new Date().toISOString()}]`, ...args);
}
function logError(...args) {
  console.error(`[automation-worker ${new Date().toISOString()}]`, ...args);
}

function randomBetween(min, max) {
  const lo = Number(min) || 0;
  const hi = Math.max(Number(max) || lo, lo);
  return lo + Math.random() * (hi - lo);
}

async function bridgePost(path, accountId, body) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-ID": accountId },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...json };
}

// ── Giờ Việt Nam — server chạy UTC, tính riêng để so với start_time/end_time
// dạng "HH:MM" và days_of_week (1=Thứ 2 ... 7=Chủ nhật, ISO) do người dùng
// nhập theo giờ VN. ────────────────────────────────────────────────────────
function vnNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return {
    hhmm: `${hour}:${get("minute")}`,
    dow: weekdayMap[get("weekday")] || 1,
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function isWithinSchedule(campaign) {
  const { hhmm, dow } = vnNow();
  const days = Array.isArray(campaign.days_of_week) ? campaign.days_of_week : [1, 2, 3, 4, 5, 6, 7];
  if (!days.includes(dow)) return false;
  const start = campaign.start_time || "00:00";
  const end = campaign.end_time || "23:59";
  if (start <= end) return hhmm >= start && hhmm < end;
  // Khung qua nửa đêm (vd 22:00 -> 02:00) — hiếm nhưng không loại trừ.
  return hhmm >= start || hhmm < end;
}

function renderTemplate(text, recipientName) {
  return String(text || "").replace(/\{\{\s*ten\s*\}\}/gi, recipientName || "");
}

// ═══════════════════════════════════════════════════════════════════════
// 1) GỬI HÀNG LOẠT (zalo_bulk_jobs)
// ═══════════════════════════════════════════════════════════════════════

async function tickBulkJobs(sb) {
  const { data: jobs, error } = await sb
    .from("zalo_bulk_jobs")
    .select("*")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true });
  if (error) {
    logError(`load bulk jobs failed: ${error.message}`);
    return;
  }
  for (const job of jobs || []) {
    try {
      await processBulkJobOnce(sb, job);
    } catch (e) {
      logError(`[job ${job.id}] processBulkJobOnce failed: ${e.message}`);
    }
  }
}

async function processBulkJobOnce(sb, job) {
  if (job.status === "pending") {
    await sb.from("zalo_bulk_jobs").update({ status: "running" }).eq("id", job.id);
  }

  // Đủ giãn cách kể từ item xử lý gần nhất chưa? Đọc lại từ DB (không giữ
  // state RAM) để worker restart không gửi dồn dập.
  const { data: lastItems } = await sb
    .from("zalo_bulk_job_items")
    .select("processed_at")
    .eq("job_id", job.id)
    .not("processed_at", "is", null)
    .order("processed_at", { ascending: false })
    .limit(1);
  const lastAt = lastItems?.[0]?.processed_at ? new Date(lastItems[0].processed_at).getTime() : 0;
  if (lastAt) {
    const elapsedSec = (Date.now() - lastAt) / 1000;
    const requiredGap = randomBetween(job.delay_seconds_min, job.delay_seconds_max);
    if (elapsedSec < requiredGap) return; // chưa tới lượt tick sau
  }

  const { data: pendingItems, error: itemErr } = await sb
    .from("zalo_bulk_job_items")
    .select("*")
    .eq("job_id", job.id)
    .eq("status", "pending")
    .order("id", { ascending: true })
    .limit(1);
  if (itemErr) {
    logError(`[job ${job.id}] load pending item failed: ${itemErr.message}`);
    return;
  }
  const item = pendingItems?.[0];
  if (!item) {
    await sb.from("zalo_bulk_jobs").update({ status: "completed" }).eq("id", job.id);
    log(`[job ${job.id}] hoàn tất — hết danh sách`);
    return;
  }

  let result;
  try {
    if (job.job_type === "send_message") {
      result = await bridgePost("/api/all-platform/zalo/action/send-by-phone", job.account_id, {
        phone: item.phone,
        message: job.message || "",
        image_urls: job.image_urls || [],
      });
    } else if (job.job_type === "add_friend") {
      result = await bridgePost("/api/all-platform/zalo/action/add-friend-by-phone", job.account_id, {
        phone: item.phone,
        message: job.message || undefined,
      });
    } else if (job.job_type === "invite_group") {
      result = await bridgePost("/api/all-platform/zalo/action/invite-group-by-phone", job.account_id, {
        phone: item.phone,
        group_id: job.target_group_id,
      });
    } else {
      result = { ok: false, error: `unknown job_type: ${job.job_type}` };
    }
  } catch (e) {
    result = { ok: false, error: e.message };
  }

  const itemStatus = result.ok ? "sent" : result.status === 404 ? "not_found" : "failed";
  await sb
    .from("zalo_bulk_job_items")
    .update({
      status: itemStatus,
      uid: result.uid || null,
      display_name: result.display_name || null,
      error: result.ok ? null : String(result.error || "unknown error"),
      processed_at: new Date().toISOString(),
    })
    .eq("id", item.id);

  await sb
    .from("zalo_bulk_jobs")
    .update({
      sent_count: (job.sent_count || 0) + 1,
      success_count: (job.success_count || 0) + (result.ok ? 1 : 0),
      failed_count: (job.failed_count || 0) + (result.ok ? 0 : 1),
    })
    .eq("id", job.id);

  log(`[job ${job.id}] ${job.job_type} phone=${item.phone} -> ${itemStatus}`);
}

// ═══════════════════════════════════════════════════════════════════════
// 2) CHIẾN DỊCH TỰ ĐỘNG (zalo_campaigns)
// ═══════════════════════════════════════════════════════════════════════

async function tickCampaigns(sb) {
  const { data: campaigns, error } = await sb.from("zalo_campaigns").select("*").eq("is_enabled", true);
  if (error) {
    logError(`load campaigns failed: ${error.message}`);
    return;
  }
  for (const campaign of campaigns || []) {
    try {
      await processCampaignOnce(sb, campaign);
    } catch (e) {
      logError(`[campaign ${campaign.id}] processCampaignOnce failed: ${e.message}`);
    }
  }
}

async function processCampaignOnce(sb, campaign) {
  if (!isWithinSchedule(campaign)) return;

  const { dateStr } = vnNow();
  let sentToday = campaign.sent_today || 0;
  if (campaign.sent_today_date !== dateStr) sentToday = 0; // ngày mới — reset đếm
  if (sentToday >= (campaign.daily_limit || 0)) return;

  if (campaign.last_sent_at) {
    const elapsedSec = (Date.now() - new Date(campaign.last_sent_at).getTime()) / 1000;
    const requiredGap = randomBetween(campaign.interval_seconds_min, campaign.interval_seconds_max);
    if (elapsedSec < requiredGap) return;
  }

  const templates = Array.isArray(campaign.message_templates) ? campaign.message_templates : [];
  if (templates.length === 0) return; // chưa cấu hình nội dung — không có gì để gửi

  const { data: pendingRecipients, error: recErr } = await sb
    .from("zalo_campaign_recipients")
    .select("*")
    .eq("campaign_id", campaign.id)
    .eq("status", "pending")
    .order("id", { ascending: true })
    .limit(1);
  if (recErr) {
    logError(`[campaign ${campaign.id}] load recipient failed: ${recErr.message}`);
    return;
  }
  const recipient = pendingRecipients?.[0];
  if (!recipient) return; // hết người nhận — chờ thêm người mới, không tự tắt campaign

  // Cần tên khách để chèn {{ten}} — tra trước nếu chưa có (lưu lại cho lần sau).
  let displayName = recipient.display_name;
  if (!displayName) {
    const info = await fetch(
      `${BRIDGE_URL}/api/all-platform/zalo/find-user?phone=${encodeURIComponent(recipient.phone)}&account_id=${encodeURIComponent(campaign.account_id)}`,
      { headers: { "X-User-ID": campaign.account_id } }
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (info?.user) {
      displayName = info.user.display_name || null;
      await sb.from("zalo_campaign_recipients").update({ display_name: displayName, uid: info.user.uid }).eq("id", recipient.id);
    } else {
      // Số không có Zalo / lỗi tra cứu — đánh dấu not_found, không chặn recipient khác.
      await sb.from("zalo_campaign_recipients").update({ status: "not_found", last_error: "Không tìm thấy tài khoản Zalo" }).eq("id", recipient.id);
      await sb.from("zalo_campaign_logs").insert({ campaign_id: campaign.id, recipient_id: recipient.id, phone: recipient.phone, status: "failed", error: "not_found" });
      return;
    }
  }

  const templateIndex = (campaign.next_template_index || 0) % templates.length;
  const template = templates[templateIndex] || {};
  const messageText = renderTemplate(template.text, displayName);
  const imageUrls = Array.isArray(template.image_urls) ? template.image_urls : [];

  const result = await bridgePost("/api/all-platform/zalo/action/send-by-phone", campaign.account_id, {
    phone: recipient.phone,
    message: messageText,
    image_urls: imageUrls,
  });

  const nowIso = new Date().toISOString();
  await sb
    .from("zalo_campaign_recipients")
    .update({
      status: result.ok ? "sent" : result.status === 404 ? "not_found" : "failed",
      last_error: result.ok ? null : String(result.error || "unknown error"),
      sent_at: result.ok ? nowIso : recipient.sent_at,
    })
    .eq("id", recipient.id);

  await sb.from("zalo_campaign_logs").insert({
    campaign_id: campaign.id,
    recipient_id: recipient.id,
    phone: recipient.phone,
    status: result.ok ? "success" : "failed",
    error: result.ok ? null : String(result.error || "unknown error"),
    message_sent: messageText,
  });

  // Giữ nhịp giãn cách bất kể thành công hay lỗi — tránh dồn dập thử lại liên tục.
  await sb
    .from("zalo_campaigns")
    .update({
      sent_today: sentToday + 1,
      sent_today_date: dateStr,
      last_sent_at: nowIso,
      next_template_index: (templateIndex + 1) % templates.length,
    })
    .eq("id", campaign.id);

  log(`[campaign ${campaign.id}] gửi tới ${recipient.phone} (${displayName || "?"}) -> ${result.ok ? "success" : "failed"}`);
}

// ═══════════════════════════════════════════════════════════════════════

let _ticking = false;
async function tick() {
  if (_ticking) return;
  _ticking = true;
  try {
    const sb = getClient();
    if (!sb) return;
    await tickBulkJobs(sb);
    await tickCampaigns(sb);
  } catch (e) {
    logError(`tick failed: ${e.message}`);
  } finally {
    _ticking = false;
  }
}

export function startAutomationWorker() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    logError("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY chưa cấu hình — automation worker KHÔNG chạy.");
    return;
  }
  log(`starting, interval=${TICK_INTERVAL_MS}ms bridge=${BRIDGE_URL}`);
  setInterval(() => void tick(), TICK_INTERVAL_MS);
  void tick();
}
