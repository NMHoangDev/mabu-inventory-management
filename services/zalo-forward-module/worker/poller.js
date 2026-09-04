/**
 * poller.js — worker nền của zalo-forward-module.
 *
 * Thay thế forwardEngine.js cũ (services/zalo-bridge) — trước đây detect tin
 * nhắn mới bằng cách hook thẳng vào WS listener sống (tức thời), giờ detect
 * bằng cách POLL bảng Supabase `zalo_messages` (do zalo-bridge tự persist gần
 * như real-time qua persistIncomingMessage()) — đánh đổi lấy độ trễ vài giây
 * (POLL_INTERVAL_MS) để đổi lấy việc tách hoàn toàn khỏi session Zalo sống.
 *
 * Việc GỬI thật vẫn phải đi qua zalo-bridge (Zalo chỉ cho 1 kết nối WS sống/
 * account — xem CLAUDE.md) qua 3 endpoint mới:
 *   POST /api/all-platform/zalo/forward/text
 *   POST /api/all-platform/zalo/forward/media
 *   POST /api/all-platform/zalo/forward/sticker
 * (services/zalo-bridge/src/routes/zalo-client.js) — bridge tự lo phần pacing
 * tuần tự + delay GIỮA CÁC TARGET trong 1 lệnh gọi; poller chỉ lo pacing GIỮA
 * CÁC LƯỢT (nguồn tin nhắn khác nhau) qua runSerialized() bên dưới.
 *
 * Cải tiến so với bản gốc: dùng watermark persist trong bảng
 * zalo_forward_cursor thay vì Set in-memory 60s TTL — không mất/lặp khi
 * module restart, và không cần loop-guard forwardedIds/processedSource nữa
 * (cursor tự nhiên không xử lý lại 1 dòng đã qua cursor).
 *
 * FORWARD_DRY_RUN=true (mặc định) — vẫn detect+match+ghi log
 * (status='dry_run') nhưng KHÔNG gọi endpoint gửi thật. Dùng để verify logic
 * match đúng với traffic thật trước khi cutover (tắt hook cũ trong
 * sessionManager.js) — xem mục Rollout trong plan.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const BRIDGE_URL = process.env.ZALO_BRIDGE_URL || "http://localhost:3001";
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || "";

const POLL_INTERVAL_MS = Number(process.env.FORWARD_POLL_INTERVAL_MS || 3000);
const RULES_CACHE_TTL_MS = 8000;
const FORWARD_DELAY_MS = Number(process.env.ZALO_FORWARD_DELAY_MS || 10000);
const MAX_PER_MIN = Number(process.env.ZALO_FORWARD_MAX_PER_MIN || 60);
const IMAGE_BATCH_MS = Number(process.env.ZALO_FORWARD_IMAGE_BATCH_MS || 3000);
const IMAGE_BATCH_MAX_WAIT_MS = Number(process.env.ZALO_FORWARD_IMAGE_BATCH_MAX_MS || 8000);
const FORWARD_TASK_TIMEOUT_MS = Number(process.env.ZALO_FORWARD_TASK_TIMEOUT_MS || 45000);
const MESSAGES_PER_TICK = Number(process.env.FORWARD_MESSAGES_PER_TICK || 200);

// FORWARD_DRY_RUN mặc định TRUE — phải set rõ "false" mới thật sự gửi. An
// toàn theo hướng "không gửi nhầm" hơn là "quên bật".
const DRY_RUN = String(process.env.FORWARD_DRY_RUN ?? "true").toLowerCase() !== "false";

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  _client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  return _client;
}

function log(...args) {
  console.log(`[forward-poller ${new Date().toISOString()}]`, ...args);
}
function logError(...args) {
  console.error(`[forward-poller ${new Date().toISOString()}]`, ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTaskTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout sau ${ms}ms`)), ms))
  ]);
}

// ── Rule cache (giống forwardEngine.js gốc) ──────────────────────────────────
const rulesCacheByAccount = new Map(); // accountId -> { fetchedAt, rulesByMaster }
let activeAccountsCache = { fetchedAt: 0, ids: [] };

async function loadRulesByMaster(accountId) {
  const cached = rulesCacheByAccount.get(accountId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < RULES_CACHE_TTL_MS) return cached.rulesByMaster;

  const rulesByMaster = new Map();
  const sb = getClient();
  if (!sb) {
    rulesCacheByAccount.set(accountId, { fetchedAt: now, rulesByMaster });
    return rulesByMaster;
  }
  try {
    const { data, error } = await sb
      .from("v_zalo_forward_rules_active")
      .select("rule_id, master_thread_id, target_thread_id")
      .eq("account_id", accountId);
    if (!error && Array.isArray(data)) {
      const byRule = new Map();
      for (const row of data) {
        if (!byRule.has(row.rule_id)) {
          byRule.set(row.rule_id, { rule_id: row.rule_id, master_thread_id: row.master_thread_id, targets: [] });
        }
        byRule.get(row.rule_id).targets.push({ target_thread_id: row.target_thread_id });
      }
      for (const rule of byRule.values()) {
        const list = rulesByMaster.get(rule.master_thread_id) || [];
        list.push(rule);
        rulesByMaster.set(rule.master_thread_id, list);
      }
    } else if (error) {
      logError(`[${accountId}] load rules err: ${error.message}`);
    }
  } catch (err) {
    logError(`[${accountId}] load rules failed: ${err.message}`);
  }
  rulesCacheByAccount.set(accountId, { fetchedAt: now, rulesByMaster });
  return rulesByMaster;
}

async function getActiveAccountIds() {
  const now = Date.now();
  if (now - activeAccountsCache.fetchedAt < RULES_CACHE_TTL_MS) return activeAccountsCache.ids;
  const sb = getClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("zalo_forward_rules")
      .select("account_id")
      .eq("is_enabled", true);
    if (error) throw error;
    const ids = Array.from(new Set((data || []).map((r) => r.account_id)));
    activeAccountsCache = { fetchedAt: now, ids };
    return ids;
  } catch (err) {
    logError(`load active accounts failed: ${err.message}`);
    return activeAccountsCache.ids;
  }
}

// ── Rate limit + serialized queue (giống forwardEngine.js gốc) ──────────────
const rateState = new Map();
function consumeRateBudget(accountId) {
  const now = Date.now();
  const s = rateState.get(accountId);
  if (!s || now - s.windowStart >= 60000) {
    rateState.set(accountId, { windowStart: now, count: 1 });
    return true;
  }
  if (s.count >= MAX_PER_MIN) return false;
  s.count += 1;
  return true;
}

const accountForwardQueue = new Map();
const accountLastForwardFinishedAt = new Map();
function runSerialized(accountId, task) {
  const prevTail = accountForwardQueue.get(accountId) || Promise.resolve();
  const nextTail = prevTail
    .catch(() => {})
    .then(async () => {
      const lastFinishedAt = accountLastForwardFinishedAt.get(accountId) || 0;
      const wait = FORWARD_DELAY_MS - (Date.now() - lastFinishedAt);
      if (wait > 0) await sleep(wait);
      try {
        await withTaskTimeout(task(), FORWARD_TASK_TIMEOUT_MS, `[${accountId}] task`);
      } catch (err) {
        logError(`[${accountId}] serialized task failed: ${err.message}`);
      } finally {
        accountLastForwardFinishedAt.set(accountId, Date.now());
      }
    });
  accountForwardQueue.set(accountId, nextTail);
  return nextTail;
}

// ── Bridge client — gọi endpoint gửi thật ────────────────────────────────────
async function bridgeForward(path, accountId, body) {
  const headers = { "Content-Type": "application/json", "x-user-id": accountId };
  if (BRIDGE_API_KEY) headers["x-api-key"] = BRIDGE_API_KEY;
  const res = await fetch(`${BRIDGE_URL}/api/all-platform/zalo${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ account_id: accountId, ...body })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `bridge ${path} ${res.status}`);
  }
  return json; // { success: [...], fail: [...] }
}

// ── Log ───────────────────────────────────────────────────────────────────
async function logForward(entry) {
  try {
    const sb = getClient();
    if (!sb) return;
    const { error } = await sb.from("zalo_forward_logs").insert({
      rule_id: entry.rule_id ?? null,
      account_id: entry.account_id,
      source_thread_id: entry.source_thread_id,
      source_msg_id: entry.source_msg_id ?? null,
      target_thread_id: entry.target_thread_id,
      content_type: entry.content_type,
      status: entry.status,
      error: entry.error ?? null
    });
    if (error) logError(`logForward insert rejected: ${error.message}`);
  } catch (err) {
    logError(`logForward failed: ${err.message}`);
  }
}

// ── Forward: text ─────────────────────────────────────────────────────────
async function forwardText({ accountId, rules, threadId, sourceMsgId, ts, text, mentions }) {
  const hasTagAll = Array.isArray(mentions) && mentions.length > 0;
  for (const rule of rules) {
    const targetThreadIds = rule.targets.map((t) => t.target_thread_id);
    if (targetThreadIds.length === 0) continue;
    const targetSummary = targetThreadIds.join(",");

    if (DRY_RUN) {
      await logForward({
        rule_id: rule.rule_id,
        account_id: accountId,
        source_thread_id: threadId,
        source_msg_id: sourceMsgId,
        target_thread_id: targetSummary,
        content_type: "text",
        status: "dry_run"
      });
      continue;
    }

    try {
      const resp = await bridgeForward("/forward/text", accountId, {
        targetThreadIds,
        text,
        mentions: hasTagAll ? mentions : undefined,
        reference: sourceMsgId ? { id: sourceMsgId, ts, logSrcType: 1, fwLvl: 1 } : undefined
      });
      const successCount = resp?.success?.length || 0;
      const failCount = resp?.fail?.length || 0;
      await logForward({
        rule_id: rule.rule_id,
        account_id: accountId,
        source_thread_id: threadId,
        source_msg_id: sourceMsgId,
        target_thread_id: targetSummary,
        content_type: "text",
        status: failCount === 0 ? "success" : successCount > 0 ? "partial" : "failed",
        error: failCount > 0 ? JSON.stringify(resp.fail) : null
      });
    } catch (err) {
      logError(`[${accountId}] forwardText rule=${rule.rule_id} failed: ${err.message}`);
      await logForward({
        rule_id: rule.rule_id,
        account_id: accountId,
        source_thread_id: threadId,
        source_msg_id: sourceMsgId,
        target_thread_id: targetSummary,
        content_type: "text",
        status: "failed",
        error: err.message
      });
    }
  }
}

// ── Forward: media ───────────────────────────────────────────────────────
async function forwardMedia({ accountId, rules, threadId, sourceMsgId, imageUrls }) {
  for (const rule of rules) {
    const targetThreadIds = rule.targets.map((t) => t.target_thread_id);
    if (targetThreadIds.length === 0) continue;

    if (DRY_RUN) {
      for (const targetId of targetThreadIds) {
        await logForward({
          rule_id: rule.rule_id,
          account_id: accountId,
          source_thread_id: threadId,
          source_msg_id: sourceMsgId,
          target_thread_id: targetId,
          content_type: "media",
          status: "dry_run"
        });
      }
      continue;
    }

    try {
      const resp = await bridgeForward("/forward/media", accountId, { targetThreadIds, imageUrls });
      for (const s of resp?.success || []) {
        await logForward({
          rule_id: rule.rule_id,
          account_id: accountId,
          source_thread_id: threadId,
          source_msg_id: sourceMsgId,
          target_thread_id: s.threadId,
          content_type: "media",
          status: "success"
        });
      }
      for (const f of resp?.fail || []) {
        await logForward({
          rule_id: rule.rule_id,
          account_id: accountId,
          source_thread_id: threadId,
          source_msg_id: sourceMsgId,
          target_thread_id: f.threadId,
          content_type: "media",
          status: "failed",
          error: f.error
        });
      }
    } catch (err) {
      logError(`[${accountId}] forwardMedia rule=${rule.rule_id} failed: ${err.message}`);
      for (const targetId of targetThreadIds) {
        await logForward({
          rule_id: rule.rule_id,
          account_id: accountId,
          source_thread_id: threadId,
          source_msg_id: sourceMsgId,
          target_thread_id: targetId,
          content_type: "media",
          status: "failed",
          error: err.message
        });
      }
    }
  }
}

// ── Forward: sticker ─────────────────────────────────────────────────────
async function forwardSticker({ accountId, rules, threadId, sourceMsgId, sticker }) {
  for (const rule of rules) {
    const targetThreadIds = rule.targets.map((t) => t.target_thread_id);
    if (targetThreadIds.length === 0) continue;

    if (DRY_RUN) {
      for (const targetId of targetThreadIds) {
        await logForward({
          rule_id: rule.rule_id,
          account_id: accountId,
          source_thread_id: threadId,
          source_msg_id: sourceMsgId,
          target_thread_id: targetId,
          content_type: "sticker",
          status: "dry_run"
        });
      }
      continue;
    }

    try {
      const resp = await bridgeForward("/forward/sticker", accountId, { targetThreadIds, sticker });
      for (const s of resp?.success || []) {
        await logForward({
          rule_id: rule.rule_id,
          account_id: accountId,
          source_thread_id: threadId,
          source_msg_id: sourceMsgId,
          target_thread_id: s.threadId,
          content_type: "sticker",
          status: "success"
        });
      }
      for (const f of resp?.fail || []) {
        await logForward({
          rule_id: rule.rule_id,
          account_id: accountId,
          source_thread_id: threadId,
          source_msg_id: sourceMsgId,
          target_thread_id: f.threadId,
          content_type: "sticker",
          status: "failed",
          error: f.error
        });
      }
    } catch (err) {
      logError(`[${accountId}] forwardSticker rule=${rule.rule_id} failed: ${err.message}`);
      for (const targetId of targetThreadIds) {
        await logForward({
          rule_id: rule.rule_id,
          account_id: accountId,
          source_thread_id: threadId,
          source_msg_id: sourceMsgId,
          target_thread_id: targetId,
          content_type: "sticker",
          status: "failed",
          error: err.message
        });
      }
    }
  }
}

// ── Gom ảnh cùng batch (giống forwardEngine.js gốc) ──────────────────────────
const imageBatches = new Map(); // key `${accountId}:${threadId}:${senderUid}`
function flushImageBatch(key) {
  const batch = imageBatches.get(key);
  if (!batch) return;
  imageBatches.delete(key);
  if (batch.timer) clearTimeout(batch.timer);
  runSerialized(batch.accountId, () =>
    forwardMedia({
      accountId: batch.accountId,
      rules: batch.rules,
      threadId: batch.threadId,
      sourceMsgId: batch.sourceMsgIds[0] || null,
      imageUrls: batch.imageUrls
    })
  ).catch((err) => logError(`[${batch.accountId}] forwardMedia batch flush failed: ${err.message}`));
}
function queueImageForBatch({ accountId, rules, threadId, sourceMsgId, senderUid, imageUrls }) {
  const key = `${accountId}:${threadId}:${senderUid || "unknown"}`;
  let batch = imageBatches.get(key);
  if (!batch) {
    batch = { imageUrls: [], sourceMsgIds: [], timer: null, firstImageAt: Date.now() };
    imageBatches.set(key, batch);
  }
  batch.imageUrls.push(...imageUrls);
  if (sourceMsgId) batch.sourceMsgIds.push(sourceMsgId);
  batch.accountId = accountId;
  batch.rules = rules;
  batch.threadId = threadId;
  if (batch.timer) clearTimeout(batch.timer);

  const elapsedSinceFirst = Date.now() - batch.firstImageAt;
  if (elapsedSinceFirst >= IMAGE_BATCH_MAX_WAIT_MS) {
    flushImageBatch(key);
    return;
  }
  const remainingUntilCap = IMAGE_BATCH_MAX_WAIT_MS - elapsedSinceFirst;
  const waitMs = Math.min(IMAGE_BATCH_MS, remainingUntilCap);
  batch.timer = setTimeout(() => flushImageBatch(key), waitMs);
}

// ── Cursor (watermark) — thay cho loop-guard in-memory của bản gốc ─────────
async function readCursor(accountId) {
  const sb = getClient();
  if (!sb) return 0;
  const { data, error } = await sb
    .from("zalo_forward_cursor")
    .select("last_message_ts")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) {
    logError(`[${accountId}] readCursor failed: ${error.message}`);
    return 0;
  }
  if (!data) {
    // Chưa có cursor — seed = now() để KHÔNG xử lý toàn bộ lịch sử tin nhắn
    // cũ ngay lần đầu module chạy (chỉ forward tin nhắn mới từ lúc này).
    const seedTs = Date.now();
    await sb.from("zalo_forward_cursor").upsert({ account_id: accountId, last_message_ts: seedTs });
    log(`[${accountId}] seeded cursor at ts=${seedTs} (first run)`);
    return seedTs;
  }
  return Number(data.last_message_ts) || 0;
}

async function writeCursor(accountId, ts) {
  const sb = getClient();
  if (!sb) return;
  const { error } = await sb
    .from("zalo_forward_cursor")
    .upsert({ account_id: accountId, last_message_ts: ts, updated_at: new Date().toISOString() });
  if (error) logError(`[${accountId}] writeCursor failed: ${error.message}`);
}

// ── Xử lý 1 dòng zalo_messages ────────────────────────────────────────────
async function processRow(accountId, row, rulesByMaster) {
  const threadId = row.thread_id || row.group_id;
  const rules = rulesByMaster.get(threadId) || [];
  if (rules.length === 0) return;

  if (!consumeRateBudget(accountId)) {
    logError(`[${accountId}] rate limit (${MAX_PER_MIN}/min) exceeded, skip master=${threadId}`);
    return;
  }

  const sourceMsgId = row.source_message_id ? String(row.source_message_id) : null;
  const ts = Number(row.ts) || 0;
  const hasTextContent = typeof row.content === "string" && row.content.length > 0;

  const rawMentions = Array.isArray(row.mentions) ? row.mentions : [];
  const tagAllMentions = rawMentions.filter(
    (m) => m && String(m.uid) === "-1" && Number.isFinite(m.pos) && m.pos >= 0 && Number.isFinite(m.len) && m.len > 0
  );

  if (hasTextContent) {
    log(`[${accountId}] master matched thread=${threadId} rules=${rules.length} type=text`);
    await runSerialized(accountId, () =>
      forwardText({ accountId, rules, threadId, sourceMsgId, ts, text: row.content, mentions: tagAllMentions })
    );
    return;
  }

  const imageUrls = Array.isArray(row.image_urls) ? row.image_urls.filter(Boolean) : [];
  if (imageUrls.length > 0) {
    log(`[${accountId}] master matched thread=${threadId} rules=${rules.length} type=media`);
    queueImageForBatch({ accountId, rules, threadId, sourceMsgId, senderUid: row.sender_id || null, imageUrls });
    return;
  }

  const rawContent = row.raw_content;
  if (rawContent && typeof rawContent === "object" && Number.isFinite(Number(rawContent.id)) && Number.isFinite(Number(rawContent.cateId))) {
    log(`[${accountId}] master matched thread=${threadId} rules=${rules.length} type=sticker`);
    await runSerialized(accountId, () => forwardSticker({ accountId, rules, threadId, sourceMsgId, sticker: rawContent }));
    return;
  }

  for (const rule of rules) {
    await logForward({
      rule_id: rule.rule_id,
      account_id: accountId,
      source_thread_id: threadId,
      source_msg_id: sourceMsgId,
      target_thread_id: rule.targets.map((t) => t.target_thread_id).join(",") || "N/A",
      content_type: "unsupported",
      status: "skipped",
      error: "unsupported_content_type"
    });
  }
}

// ── 1 tick: poll tất cả account có rule đang bật ────────────────────────────
async function pollAccount(accountId) {
  const sb = getClient();
  if (!sb) return;

  const rulesByMaster = await loadRulesByMaster(accountId);
  if (rulesByMaster.size === 0) return; // không có rule nào đang bật cho account này

  const cursor = await readCursor(accountId);
  const { data, error } = await sb
    .from("zalo_messages")
    .select("thread_id, group_id, source_message_id, sender_id, content, image_urls, raw_content, mentions, ts, thread_type")
    .eq("account_id", accountId)
    .eq("thread_type", "group")
    .gt("ts", cursor)
    .order("ts", { ascending: true })
    .limit(MESSAGES_PER_TICK);

  if (error) {
    logError(`[${accountId}] poll query failed: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) return;

  let maxTs = cursor;
  for (const row of data) {
    try {
      await processRow(accountId, row, rulesByMaster);
    } catch (err) {
      logError(`[${accountId}] processRow failed: ${err.message}`);
    }
    if (Number(row.ts) > maxTs) maxTs = Number(row.ts);
  }
  await writeCursor(accountId, maxTs);
}

let _ticking = false;
async function pollTick() {
  if (_ticking) return; // tránh chồng tick nếu 1 lượt poll trước chạy lâu hơn interval
  _ticking = true;
  try {
    const accountIds = await getActiveAccountIds();
    for (const accountId of accountIds) {
      await pollAccount(accountId);
    }
  } catch (err) {
    logError(`pollTick failed: ${err.message}`);
  } finally {
    _ticking = false;
  }
}

export function startPoller() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    logError("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY chưa cấu hình — poller KHÔNG chạy.");
    return;
  }
  log(
    `starting, interval=${POLL_INTERVAL_MS}ms dry_run=${DRY_RUN} bridge=${BRIDGE_URL} ` +
      `(FORWARD_DRY_RUN=false để bật gửi thật sau khi đã verify log dry-run khớp đúng)`
  );
  setInterval(() => void pollTick(), POLL_INTERVAL_MS);
  void pollTick();
}
