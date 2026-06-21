import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { computeInventoryInsights, markSuggestionStatus } from "../inventory/insights";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type RuleTrigger =
  | "order.created"
  | "order.paid"
  | "order.shipped"
  | "shipping.pickup_overdue"
  | "shipping.delivered"
  | "shipping.returned"
  | "stock.low"
  | "stock.out"
  | "reorder.suggested"
  | "reorder.critical"
  | "invoice.scanned";

export type ActionType =
  | "log"
  | "mark_reorder_status"
  | "send_webhook"
  | "create_activity_log"
  | "create_shipping";

export interface RuleCondition {
  field: string; // e.g. "order.total", "order.source", "product.stock"
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";
  value: any;
}

export interface RuleAction {
  type: ActionType;
  params?: Record<string, any>;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  run_count: number;
  last_run_at: string | null;
  last_status: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationRun {
  id: number;
  rule_id: string;
  rule_name: string;
  status: "success" | "failed" | "skipped";
  message: string;
  payload: Record<string, any>;
  executed_at: string;
}

// ──────────────────────────────────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────────────────────────────────

export async function listRules(): Promise<AutomationRule[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const r = await getPool().query(`select * from automation_rules order by created_at desc`);
  return r.rows.map(rowToRule);
}

export async function getRule(id: string): Promise<AutomationRule | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const r = await getPool().query(`select * from automation_rules where id=$1 limit 1`, [id]);
  return r.rows[0] ? rowToRule(r.rows[0]) : null;
}

export async function createRule(input: Omit<AutomationRule, "id" | "run_count" | "last_run_at" | "last_status" | "created_at" | "updated_at">): Promise<AutomationRule | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const r = await getPool().query(
    `insert into automation_rules (name, description, enabled, trigger, conditions, actions)
     values ($1,$2,$3,$4,$5::jsonb,$6::jsonb) returning *`,
    [
      input.name,
      input.description ?? "",
      input.enabled,
      input.trigger,
      JSON.stringify(input.conditions ?? []),
      JSON.stringify(input.actions ?? []),
    ]
  );
  return r.rows[0] ? rowToRule(r.rows[0]) : null;
}

export async function updateRule(id: string, patch: Partial<AutomationRule>): Promise<boolean> {
  if (!isDatabaseConfigured) return false;
  await ensureDatabase();
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (["id","run_count","last_run_at","last_status","created_at","updated_at"].includes(k)) continue;
    if (k === "conditions" || k === "actions") {
      fields.push(`${k} = $${idx++}::jsonb`);
      values.push(JSON.stringify(v));
    } else {
      fields.push(`${k} = $${idx++}`);
      values.push(v);
    }
  }
  if (fields.length === 0) return true; // nothing to update
  fields.push(`updated_at = now()`);
  values.push(id);
  const r = await getPool().query(`update automation_rules set ${fields.join(", ")} where id=$${idx}`, values);
  return (r.rowCount ?? 0) > 0;
}

export async function deleteRule(id: string): Promise<boolean> {
  if (!isDatabaseConfigured) return false;
  await ensureDatabase();
  const r = await getPool().query(`delete from automation_rules where id=$1`, [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function listRuns(limit = 50): Promise<AutomationRun[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const r = await getPool().query(`select * from automation_runs order by executed_at desc limit $1`, [limit]);
  return r.rows.map((row: any) => ({
    id: Number(row.id),
    rule_id: row.rule_id,
    rule_name: row.rule_name,
    status: row.status,
    message: row.message ?? "",
    payload: row.payload ?? {},
    executed_at: row.executed_at,
  }));
}

// ──────────────────────────────────────────────────────────────────────
// Engine — evaluate a payload against rules for a given trigger
// ──────────────────────────────────────────────────────────────────────

export interface RuleExecutionResult {
  trigger: RuleTrigger;
  matched_rules: number;
  executed: number;
  results: Array<{ rule_id: string; rule_name: string; status: "success" | "failed" | "skipped"; message: string }>;
}

export async function runTrigger(trigger: RuleTrigger, payload: Record<string, any>): Promise<RuleExecutionResult> {
  const empty: RuleExecutionResult = { trigger, matched_rules: 0, executed: 0, results: [] };
  if (!isDatabaseConfigured) return empty;
  await ensureDatabase();
  const rules = await listRules();
  const matched = rules.filter((r) => r.enabled && r.trigger === trigger);

  for (const rule of matched) {
    const passes = evaluateConditions(rule.conditions, payload);
    if (!passes) {
      await logRun(rule, "skipped", "Điều kiện không khớp", payload);
      empty.results.push({ rule_id: rule.id, rule_name: rule.name, status: "skipped", message: "Điều kiện không khớp" });
      continue;
    }
    try {
      await executeActions(rule, payload);
      await getPool().query(
        `update automation_rules set run_count = run_count + 1, last_run_at = now(), last_status = 'success' where id = $1`,
        [rule.id]
      );
      await logRun(rule, "success", "Đã chạy", payload);
      empty.executed += 1;
      empty.results.push({ rule_id: rule.id, rule_name: rule.name, status: "success", message: "Đã chạy" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi";
      await getPool().query(
        `update automation_rules set run_count = run_count + 1, last_run_at = now(), last_status = 'failed' where id = $1`,
        [rule.id]
      );
      await logRun(rule, "failed", msg, payload);
      empty.results.push({ rule_id: rule.id, rule_name: rule.name, status: "failed", message: msg });
    }
  }
  empty.matched_rules = matched.length;
  return empty;
}

function evaluateConditions(conditions: RuleCondition[], payload: Record<string, any>): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((c) => {
    const v = getNestedValue(payload, c.field);
    switch (c.op) {
      case "eq": return v == c.value;
      case "neq": return v != c.value;
      case "gt": return Number(v) > Number(c.value);
      case "gte": return Number(v) >= Number(c.value);
      case "lt": return Number(v) < Number(c.value);
      case "lte": return Number(v) <= Number(c.value);
      case "contains": return String(v ?? "").includes(String(c.value));
      case "in": return Array.isArray(c.value) && c.value.includes(v);
      default: return false;
    }
  });
}

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

async function executeActions(rule: AutomationRule, payload: Record<string, any>) {
  for (const action of rule.actions) {
    await executeAction(action, payload);
  }
}

async function executeAction(action: RuleAction, payload: Record<string, any>) {
  const pool = getPool();
  switch (action.type) {
    case "log":
      console.log(`[automation]`, action.params?.message ?? "(no message)", payload);
      break;
    case "create_activity_log": {
      const type = action.params?.type ?? "automation";
      const message = action.params?.message ?? "Rule fired";
      await pool.query(
        `insert into activity_logs (type, message, created_at) values ($1, $2, now())`,
        [type, message]
      );
      break;
    }
    case "mark_reorder_status": {
      const productId = payload.product?.id;
      if (productId) {
        const status = action.params?.status ?? "ordered";
        await markSuggestionStatus(productId, status);
      }
      break;
    }
    case "send_webhook": {
      const url = action.params?.url;
      if (!url) return;
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rule_id: payload.rule_id, payload }),
        });
      } catch (err) {
        console.warn("webhook failed:", err);
      }
      break;
    }
    case "create_shipping": {
      const orderId = payload.order?.id;
      if (!orderId) return;
      await pool.query(
        `insert into shippings (tracking_code, order_id, customer_name, customer_phone,
                                partner, status, cod_amount, shipping_fee, branch, staff, packed_at, created_at, updated_at)
         values ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, now(), now(), now())
         on conflict (tracking_code) do nothing`,
        [
          `AUTO-${Date.now()}`,
          orderId,
          payload.order?.customer_name ?? "",
          payload.order?.customer_phone ?? "",
          action.params?.partner ?? "NINJA VAN",
          Number(payload.order?.total ?? 0),
          Number(action.params?.shipping_fee ?? 0),
          action.params?.branch ?? "Chi nhánh chính",
          action.params?.staff ?? "",
        ]
      );
      break;
    }
  }
}

async function logRun(rule: AutomationRule, status: "success" | "failed" | "skipped", message: string, payload: Record<string, any>) {
  const pool = getPool();
  try {
    await pool.query(
      `insert into automation_runs (rule_id, rule_name, status, message, payload, executed_at)
       values ($1,$2,$3,$4,$5::jsonb, now())`,
      [rule.id, rule.name, status, message, JSON.stringify({ ...payload, rule_id: rule.id })]
    );
  } catch (err) {
    console.warn("logRun failed:", err);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function rowToRule(row: any): AutomationRule {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    enabled: Boolean(row.enabled),
    trigger: row.trigger,
    conditions: row.conditions ?? [],
    actions: row.actions ?? [],
    run_count: Number(row.run_count ?? 0),
    last_run_at: row.last_run_at,
    last_status: row.last_status ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Seeder — create a few sensible default rules on first run
// ──────────────────────────────────────────────────────────────────────

export async function seedDefaultRulesIfEmpty(): Promise<number> {
  if (!isDatabaseConfigured) return 0;
  await ensureDatabase();
  const r = await getPool().query(`select count(*)::int as c from automation_rules`);
  if ((r.rows[0]?.c ?? 0) > 0) return 0;
  const seeds: Array<Omit<AutomationRule, "id" | "run_count" | "last_run_at" | "last_status" | "created_at" | "updated_at">> = [
    {
      name: "Đơn lớn từ Zalo → tự tạo vận đơn",
      description: "Khi có đơn từ Zalo > 500k thì tự tạo vận đơn NINJA VAN",
      enabled: true,
      trigger: "order.created",
      conditions: [
        { field: "order.source", op: "eq", value: "zalo" },
        { field: "order.total", op: "gte", value: 500000 },
      ],
      actions: [
        { type: "create_shipping", params: { partner: "NINJA VAN" } },
        { type: "create_activity_log", params: { type: "automation", message: "Auto-tạo vận đơn cho đơn Zalo lớn" } },
      ],
    },
    {
      name: "Sản phẩm hết hàng → log cảnh báo",
      description: "Khi có sản phẩm hết hàng thì ghi log cảnh báo",
      enabled: true,
      trigger: "stock.out",
      conditions: [],
      actions: [
        { type: "create_activity_log", params: { type: "alert", message: "Có sản phẩm đã hết hàng — cần nhập gấp!" } },
      ],
    },
    {
      name: "Reorder critical → đánh dấu đã đặt",
      description: "Khi AI đề xuất nhập hàng ở mức critical, tự đánh dấu 'ordered' để ẩn khỏi danh sách",
      enabled: false,
      trigger: "reorder.critical",
      conditions: [],
      actions: [
        { type: "mark_reorder_status", params: { status: "ordered" } },
      ],
    },
  ];
  let count = 0;
  for (const s of seeds) {
    const created = await createRule(s);
    if (created) count += 1;
  }
  return count;
}
