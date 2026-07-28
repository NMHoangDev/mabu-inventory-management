"use client";

import { useEffect, useState } from "react";
import {
  Zap,
  Plus,
  Play,
  Trash2,
  Power,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Filter,
  Edit3,
} from "lucide-react";
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { PageGuard } from "@/components/auth/PageGuard";

interface Condition {
  field: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";
  value: any;
}

interface Action {
  type: "log" | "mark_reorder_status" | "send_webhook" | "create_activity_log" | "create_shipping";
  params?: Record<string, any>;
}

interface Rule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: string;
  conditions: Condition[];
  actions: Action[];
  run_count: number;
  last_run_at: string | null;
  last_status: string;
  created_at: string;
  updated_at: string;
}

interface Run {
  id: number;
  rule_id: string;
  rule_name: string;
  status: "success" | "failed" | "skipped";
  message: string;
  executed_at: string;
}

const TRIGGER_OPTIONS = [
  { value: "order.created", label: "Đơn hàng mới" },
  { value: "order.paid", label: "Đơn đã thanh toán" },
  { value: "order.shipped", label: "Đơn đã giao" },
  { value: "shipping.pickup_overdue", label: "Vận đơn quá hạn pickup" },
  { value: "shipping.delivered", label: "Vận đơn đã giao" },
  { value: "shipping.returned", label: "Vận đơn hoàn" },
  { value: "stock.low", label: "Sắp hết hàng" },
  { value: "stock.out", label: "Hết hàng" },
  { value: "reorder.suggested", label: "AI gợi ý nhập hàng" },
  { value: "reorder.critical", label: "AI nhập hàng khẩn cấp" },
  { value: "invoice.scanned", label: "Hóa đơn đã scan" },
];

const ACTION_OPTIONS = [
  { value: "create_activity_log", label: "Ghi log hoạt động" },
  { value: "create_shipping", label: "Tự tạo vận đơn" },
  { value: "mark_reorder_status", label: "Đánh dấu đề xuất" },
  { value: "send_webhook", label: "Gọi webhook" },
  { value: "log", label: "Ghi log console" },
];

const FIELD_SUGGESTIONS: Record<string, string[]> = {
  "order.created": ["order.total", "order.source", "order.customer_phone", "order.staff"],
  "order.paid": ["order.paid", "order.total"],
  "shipping.pickup_overdue": ["shipping.days", "shipping.partner"],
  "stock.low": ["count"],
  "stock.out": ["count"],
  "reorder.suggested": ["suggestion.urgency", "suggestion.days_until_zero", "product.stock"],
  "reorder.critical": ["suggestion.urgency"],
};

export default function AutomationsPage() {
  const { hasPermission } = usePermissions();
  const [rules, setRules] = useState<Rule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      fetch("/api/automations").then((r) => r.json()),
      fetch("/api/automations/runs?limit=30").then((r) => r.json()),
    ]);
    setRules(r1.rules ?? []);
    setRuns(r2.runs ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleRule = async (rule: Rule) => {
    await fetch(`/api/automations/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    load();
  };

  const deleteRule = async (rule: Rule) => {
    if (!confirm(`Xóa rule "${rule.name}"?`)) return;
    await fetch(`/api/automations/${rule.id}`, { method: "DELETE" });
    load();
  };

  const testRule = async (rule: Rule) => {
    setRunning(rule.id);
    const sample = samplePayloadFor(rule.trigger);
    await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "run_trigger", trigger: rule.trigger, payload: sample }),
    });
    await load();
    setRunning(null);
  };

  if (loading) {
    return (
      <div className="panel flex min-h-[400px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải…
      </div>
    );
  }

  return (
    <PageGuard permission="automations.view">
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Tự động hóa
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Rule engine chạy nền — kích hoạt hành động khi có sự kiện.</p>
        </div>
        {hasPermission("automations.create") ? (
          <button
            onClick={() => setEditing(emptyRule())}
            className="px-3 py-2 bg-amber-500 text-white text-sm rounded-lg font-medium hover:bg-amber-600 flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Tạo rule mới
          </button>
        ) : null}
      </header>

      {editing && (
        <RuleEditor
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      <div className="grid gap-3">
        {rules.length === 0 && (
          <div className="panel p-8 text-center text-slate-500">
            Chưa có rule nào. Bấm "Tạo rule mới" để bắt đầu.
          </div>
        )}
        {rules.map((r) => (
          <div key={r.id} className="panel p-4 flex items-start gap-3">
            <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${r.enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-900">{r.name}</span>
                <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-mono">{r.trigger}</span>
                {r.last_status && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    r.last_status === "success" ? "bg-emerald-50 text-emerald-700" :
                    r.last_status === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
                  }`}>
                    {r.last_status}
                  </span>
                )}
                <span className="text-[10px] text-slate-400">· chạy {r.run_count} lần</span>
              </div>
              {r.description && <p className="text-xs text-slate-500 mt-1">{r.description}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                {r.conditions.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                    {r.conditions.length} điều kiện
                  </span>
                )}
                <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
                  {r.actions.length} hành động
                </span>
                {r.last_run_at && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    <Clock className="inline h-3 w-3 mr-0.5" />
                    {timeAgo(r.last_run_at)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button
                onClick={() => testRule(r)}
                disabled={running === r.id}
                className="text-xs px-2 py-1 border rounded hover:bg-slate-50 flex items-center gap-1 disabled:opacity-50"
              >
                {running === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Test
              </button>
              {hasPermission("automations.edit") ? (
                <button
                  onClick={() => toggleRule(r)}
                  className={`text-xs px-2 py-1 border rounded flex items-center gap-1 ${
                    r.enabled ? "hover:bg-red-50 hover:border-red-300" : "hover:bg-emerald-50 hover:border-emerald-300"
                  }`}
                >
                  <Power className="h-3 w-3" /> {r.enabled ? "Tắt" : "Bật"}
                </button>
              ) : null}
              {hasPermission("automations.edit") ? (
                <button
                  onClick={() => setEditing(r)}
                  className="text-xs px-2 py-1 border rounded hover:bg-slate-50 flex items-center gap-1"
                >
                  <Edit3 className="h-3 w-3" /> Sửa
                </button>
              ) : null}
              {hasPermission("automations.delete") ? (
                <button
                  onClick={() => deleteRule(r)}
                  className="text-xs px-2 py-1 border rounded hover:bg-red-50 hover:border-red-300 text-red-600 flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" /> Xóa
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {runs.length > 0 && (
        <div className="panel p-4">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-blue-600" />
            Lịch sử chạy ({runs.length})
          </h2>
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {runs.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-100">
                {r.status === "success" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                ) : r.status === "failed" ? (
                  <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                ) : (
                  <Filter className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                )}
                <span className="font-medium text-slate-700 flex-shrink-0">{r.rule_name}</span>
                <span className="text-slate-500 truncate flex-1">{r.message}</span>
                <span className="text-slate-400 text-[10px]">{timeAgo(r.executed_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </PageGuard>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Rule Editor
// ──────────────────────────────────────────────────────────────────────

function RuleEditor({ rule, onClose, onSaved }: { rule: Rule; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(rule.name);
  const [description, setDescription] = useState(rule.description);
  const [trigger, setTrigger] = useState(rule.trigger);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [conditions, setConditions] = useState<Condition[]>(rule.conditions);
  const [actions, setActions] = useState<Action[]>(rule.actions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fieldSuggestions = FIELD_SUGGESTIONS[trigger] ?? [];

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = { name, description, trigger, enabled, conditions, actions };
      const isNew = !rule.id || rule.id === "new";
      const res = await fetch(isNew ? "/api/automations" : `/api/automations/${rule.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel p-5 space-y-4 border-2 border-amber-300">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{rule.id === "new" ? "Tạo rule mới" : `Sửa rule: ${rule.name}`}</h2>
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">Đóng</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500">Tên rule</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
            placeholder="VD: Đơn Zalo lớn → tạo vận đơn"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Trigger</label>
          <select
            value={trigger}
            onChange={(e) => { setTrigger(e.target.value); setConditions([]); }}
            className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
          >
            {TRIGGER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-500">Mô tả</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-lg w-full"
          placeholder="Giải thích rule làm gì"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500">Điều kiện (AND — tất cả phải đúng)</span>
          <button
            onClick={() => setConditions([...conditions, { field: fieldSuggestions[0] ?? "order.total", op: "eq", value: "" }])}
            className="text-xs text-blue-600 hover:underline"
          >
            + Thêm điều kiện
          </button>
        </div>
        <div className="space-y-2">
          {conditions.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                list="field-suggestions"
                value={c.field}
                onChange={(e) => {
                  const cc = [...conditions];
                  cc[i] = { ...c, field: e.target.value };
                  setConditions(cc);
                }}
                className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded"
                placeholder="order.total"
              />
              <datalist id="field-suggestions">
                {fieldSuggestions.map((f) => <option key={f} value={f} />)}
              </datalist>
              <select
                value={c.op}
                onChange={(e) => {
                  const cc = [...conditions];
                  cc[i] = { ...c, op: e.target.value as any };
                  setConditions(cc);
                }}
                className="px-2 py-1.5 text-sm border border-slate-300 rounded"
              >
                {["eq","neq","gt","gte","lt","lte","contains","in"].map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              <input
                value={String(c.value)}
                onChange={(e) => {
                  const cc = [...conditions];
                  cc[i] = { ...c, value: e.target.value };
                  setConditions(cc);
                }}
                className="w-32 px-2 py-1.5 text-sm border border-slate-300 rounded"
              />
              <button
                onClick={() => setConditions(conditions.filter((_, j) => j !== i))}
                className="text-red-500 hover:text-red-700 p-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500">Hành động (chạy tuần tự)</span>
          <button
            onClick={() => setActions([...actions, { type: "create_activity_log", params: { type: "automation", message: "" } }])}
            className="text-xs text-blue-600 hover:underline"
          >
            + Thêm hành động
          </button>
        </div>
        <div className="space-y-2">
          {actions.map((a, i) => (
            <div key={i} className="p-2 bg-slate-50 rounded flex items-center gap-1">
              <select
                value={a.type}
                onChange={(e) => {
                  const aa = [...actions];
                  aa[i] = { ...a, type: e.target.value as any, params: a.params ?? {} };
                  setActions(aa);
                }}
                className="px-2 py-1.5 text-sm border border-slate-300 rounded"
              >
                {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                value={JSON.stringify(a.params ?? {})}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    const aa = [...actions];
                    aa[i] = { ...a, params: parsed };
                    setActions(aa);
                  } catch {}
                }}
                className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded font-mono"
                placeholder='{"key":"value"}'
              />
              <button
                onClick={() => setActions(actions.filter((_, j) => j !== i))}
                className="text-red-500 hover:text-red-700 p-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Kích hoạt
      </label>

      {error && <div className="text-sm text-red-600 p-2 bg-red-50 rounded">{error}</div>}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <button onClick={onClose} className="px-3 py-2 text-sm border rounded">Hủy</button>
        <button
          onClick={save}
          disabled={saving || !name || actions.length === 0}
          className="px-3 py-2 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Lưu
        </button>
      </div>
    </div>
  );
}

function emptyRule(): Rule {
  return {
    id: "new",
    name: "",
    description: "",
    enabled: true,
    trigger: "order.created",
    conditions: [],
    actions: [{ type: "create_activity_log", params: { type: "automation", message: "" } }],
    run_count: 0,
    last_run_at: null,
    last_status: "",
    created_at: "",
    updated_at: "",
  };
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "vừa xong";
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
  } catch { return iso; }
}

function samplePayloadFor(trigger: string): Record<string, any> {
  switch (trigger) {
    case "order.created":
      return { order: { id: "00000000-0000-0000-0000-000000000000", total: 750000, source: "zalo", customer_phone: "0901234567" } };
    case "stock.out":
      return { count: 1 };
    case "stock.low":
      return { count: 5 };
    case "reorder.suggested":
      return { product: { id: "00000000-0000-0000-0000-000000000000", stock: 2 }, suggestion: { urgency: "medium", days_until_zero: 3 } };
    case "reorder.critical":
      return { product: { id: "00000000-0000-0000-0000-000000000000", stock: 0 }, suggestion: { urgency: "critical" } };
    case "shipping.pickup_overdue":
      return { shipping: { id: "00000000-0000-0000-0000-000000000000", tracking_code: "TEST" }, days: 3 };
    default:
      return { sample: true };
  }
}
