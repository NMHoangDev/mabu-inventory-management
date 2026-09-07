"use client";

/**
 * Trang "Chiến dịch tự động" — nhắn tin hàng ngày theo lịch (khung giờ +
 * ngày trong tuần), giãn cách/giới hạn an toàn tài khoản, nội dung xoay vòng
 * có chèn {{ten}} + đính kèm ảnh. Đối chiếu hợp đồng dữ liệu ở
 * app/api/campaigns/route.ts (GET/POST) và app/api/campaigns/[id]/route.ts
 * (GET/PATCH/DELETE, do agent khác viết song song) — trang này KHÔNG đụng
 * vào các route đó hay worker/automationWorker.js (engine chạy campaign).
 *
 * Chưa thêm mục nào vào Sidebar (src/components/Sidebar.tsx) — nằm trong
 * danh sách file không được sửa của task này, xem báo cáo bàn giao.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, Power, RefreshCw, Repeat, Trash2, X } from "lucide-react";
import { apiUrl } from "@/lib/basePath";
import type { ZaloAccountSummary, ZaloCampaign } from "@/lib/types";
import { alert, btn, btnSize, card, pageStack, pill, select, table } from "@/lib/ui";
import { CampaignFormModal } from "@/components/campaigns/CampaignFormModal";

const DAY_LABELS: Record<number, string> = { 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 7: "CN" };

function formatDaysOfWeek(days: number[] | undefined | null): string {
  const sorted = Array.from(new Set(days || [])).filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (sorted.length === 0) return "—";
  if (sorted.length === 7) return "T2-CN";
  const isContiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (isContiguous && sorted.length > 1) return `${DAY_LABELS[sorted[0]]}-${DAY_LABELS[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => DAY_LABELS[d]).join(", ");
}

/** So khớp gần đúng với "hôm nay" theo giờ trình duyệt — chỉ để hiển thị; worker tự tính lại theo giờ server (Asia/Ho_Chi_Minh). */
function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CampaignsPage() {
  const [accounts, setAccounts] = useState<ZaloAccountSummary[]>([]);
  const [campaigns, setCampaigns] = useState<ZaloCampaign[]>([]);
  const [accountFilter, setAccountFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [modalState, setModalState] = useState<{ mode: "create" } | { mode: "edit"; campaign: ZaloCampaign } | null>(null);

  const today = useMemo(() => todayDateStr(), []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/accounts"), { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
    } catch {
      setAccounts([]);
    }
  }, []);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = accountFilter ? `?account_id=${encodeURIComponent(accountFilter)}` : "";
      const res = await fetch(apiUrl(`/api/campaigns${qs}`), { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setCampaigns(Array.isArray(data?.campaigns) ? data.campaigns : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách chiến dịch.");
    } finally {
      setLoading(false);
    }
  }, [accountFilter]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  function accountLabel(accountId: string): string {
    return accounts.find((a) => a.account_id === accountId)?.display_name || accountId;
  }

  async function handleToggle(campaign: ZaloCampaign) {
    setTogglingId(campaign.id);
    setError(null);
    const nextEnabled = !campaign.is_enabled;
    try {
      const res = await fetch(apiUrl(`/api/campaigns/${campaign.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: nextEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? { ...c, is_enabled: nextEnabled } : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đổi được trạng thái chiến dịch.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(campaign: ZaloCampaign) {
    if (!window.confirm(`Xoá chiến dịch "${campaign.name}"? Toàn bộ người nhận + nhật ký gửi sẽ mất theo.`)) return;
    setDeletingId(campaign.id);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/campaigns/${campaign.id}`), { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setNotice(`Đã xoá chiến dịch "${campaign.name}".`);
      await loadCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xoá được chiến dịch.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={pageStack}>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-subtle text-brand">
          <Repeat className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Chiến dịch tự động</h1>
          <p className="text-sm text-slate-500">
            Tự động nhắn tin hàng ngày theo khung giờ, tần suất và nội dung xoay vòng đã cấu hình sẵn.
          </p>
        </div>
      </div>

      {error ? (
        <div className={`${alert.error} justify-between`}>
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </span>
          <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className={`${alert.success} justify-between`}>
          <span className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {notice}
          </span>
          <button type="button" onClick={() => setNotice(null)} className="text-emerald-400 hover:text-emerald-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Danh sách chiến dịch</h2>
            <p className="text-xs text-slate-500">
              {campaigns.length} chiến dịch{accountFilter ? ` cho "${accountLabel(accountFilter)}"` : ""}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className={select}>
              <option value="">— Tất cả tài khoản —</option>
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.display_name || a.account_id}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void loadCampaigns()} className={`${btn.ghost} ${btnSize.icon}`} title="Làm mới">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setModalState({ mode: "create" })}
              disabled={accounts.length === 0}
              className={`${btn.primary} ${btnSize.sm}`}
            >
              <Plus className="h-3.5 w-3.5" />
              Tạo chiến dịch mới
            </button>
          </div>
        </div>

        <div className={table.wrapper}>
          <table className={table.root}>
            <thead>
              <tr className="border-b border-slate-100">
                <th className={table.head}>Chiến dịch</th>
                <th className={table.head}>Tài khoản</th>
                <th className={table.head}>Lịch chạy</th>
                <th className={table.head}>Tiến độ hôm nay</th>
                <th className={table.head}>Trạng thái</th>
                <th className={`${table.head} text-right`}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const sentToday = c.sent_today_date === today ? c.sent_today : 0;
                const pct = c.daily_limit > 0 ? Math.min(100, Math.round((sentToday / c.daily_limit) * 100)) : 0;
                return (
                  <tr key={c.id} className={table.row}>
                    <td className={`${table.cell} font-medium text-slate-900`}>{c.name}</td>
                    <td className={`${table.cell} text-xs text-slate-500`}>{accountLabel(c.account_id)}</td>
                    <td className={`${table.cell} text-xs text-slate-500`}>
                      {c.start_time}–{c.end_time} · {formatDaysOfWeek(c.days_of_week)}
                    </td>
                    <td className={table.cell}>
                      <div className="w-32">
                        <div className="mb-1 text-xs text-slate-600">
                          {sentToday}/{c.daily_limit}
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className={table.cell}>
                      <span className={c.is_enabled ? pill.success : pill.neutral}>
                        {c.is_enabled ? "Đang bật" : "Đã tắt"}
                      </span>
                    </td>
                    <td className={table.cell}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleToggle(c)}
                          disabled={togglingId === c.id}
                          className={`${c.is_enabled ? btn.outline : btn.primary} ${btnSize.sm}`}
                          title={c.is_enabled ? "Tắt chiến dịch" : "Bật chiến dịch"}
                        >
                          {togglingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                          {c.is_enabled ? "Tắt" : "Bật"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalState({ mode: "edit", campaign: c })}
                          className={`${btn.outline} ${btnSize.icon}`}
                          title="Sửa"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(c)}
                          disabled={deletingId === c.id}
                          className={`${btn.danger} ${btnSize.icon}`}
                          title="Xoá"
                        >
                          {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-500">
                    {loading ? "Đang tải..." : "Chưa có chiến dịch tự động nào."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {modalState ? (
        <CampaignFormModal
          mode={modalState.mode}
          campaign={modalState.mode === "edit" ? modalState.campaign : null}
          accounts={accounts}
          defaultAccountId={accountFilter || accounts[0]?.account_id || ""}
          onClose={() => setModalState(null)}
          onSaved={() => {
            setModalState(null);
            void loadCampaigns();
          }}
        />
      ) : null}
    </div>
  );
}
