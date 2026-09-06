"use client";

/**
 * Port từ components/zalo/forward/ZaloForwardRulesDashboard.tsx (app chính) —
 * cùng UI/logic, chỉ đổi: (1) không dùng useApp()/ZaloAccountSwitcher của app
 * chính (module độc lập, không có AppProvider) — module này chỉ vận hành
 * đúng 1 tài khoản Zalo nên KHÔNG cần dropdown chọn account, tự lấy account
 * duy nhất từ /api/accounts (fallback "shop-owner" nếu bridge chưa có account
 * nào); (2) gọi API nội bộ module qua apiUrl() (helper no-op, module deploy ở
 * domain root qua subdomain riêng) thay vì /api/zalo/*.
 */

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { forwardRulesApi } from "@/lib/forwardRulesApi";
import { apiUrl } from "@/lib/basePath";
import StaffBadge from "@/components/StaffBadge";
import type { ZaloForwardRule, ZaloForwardLog } from "@/lib/types";

type GroupOption = { id: string; name: string };

const DEFAULT_ACCOUNT_ID = "shop-owner";

/**
 * Extension "Markee Zalo Personal Connector" (extensions/extension-login-zalo,
 * manifest.json) — đóng gói .zip, đặt ở public/ của module này nên tải thẳng
 * từ chính domain của module, không qua Google Drive như app chính.
 */
const ZALO_EXTENSION_DOWNLOAD_URL = "/extension-login-zalo.zip";

function statusPillCls(status: string) {
  switch (status) {
    case "success":
      return "bg-emerald-50 text-emerald-700";
    case "partial":
      return "bg-amber-50 text-amber-700";
    case "skipped":
      return "bg-slate-100 text-slate-600";
    case "dry_run":
      return "bg-blue-50 text-blue-700";
    default:
      return "bg-red-50 text-red-700";
  }
}

export default function ForwardRulesDashboard({ role }: { role: "admin" | "staff" }) {
  const [accountId, setAccountId] = useState(DEFAULT_ACCOUNT_ID);
  const [accountLabel, setAccountLabel] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [reimporting, setReimporting] = useState(false);
  const canManage = role === "admin";

  // Module chỉ vận hành đúng 1 tài khoản Zalo — tự lấy account duy nhất từ
  // bridge (qua /api/accounts), không cần UI chọn/đổi account. Poll mỗi 5s để
  // nút "Đăng nhập lại" tự ẩn/hiện đúng theo trạng thái kết nối thật.
  useEffect(() => {
    let cancelled = false;
    async function pollAccount() {
      try {
        const res = await fetch(apiUrl("/api/accounts"), { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        const first = Array.isArray(data?.accounts) ? data.accounts[0] : null;
        if (first?.account_id) {
          setAccountId(first.account_id);
          setAccountLabel(first.display_name || first.account_id);
          setAccountStatus(first.status || null);
        }
      } catch {
        // ignore — giữ nguyên trạng thái cũ, thử lại tick sau
      }
    }
    void pollAccount();
    const id = setInterval(pollAccount, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Đăng nhập lại Zalo qua extension (cùng cơ chế với ZaloAuthCard của
  // zalo-account-module) — module này không có chat/QR UI riêng, chỉ cần 1
  // nút trigger extension lấy cookie session khi tài khoản chưa/đã mất kết nối.
  async function handleReimport() {
    const extApi = window as unknown as {
      __zaloExtension?: {
        ping: () => Promise<{ installed: boolean; version: string }>;
        importSession: (opts?: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
      };
    };
    const ext = extApi.__zaloExtension;
    if (!ext) {
      setError("Chưa cài extension Zalo. Bấm \"Tải extension\" ở trên để cài.");
      return;
    }
    setReimporting(true);
    try {
      await ext.ping().catch(() => undefined);
      const bridgeUrl = process.env.NEXT_PUBLIC_ZALO_BRIDGE_URL || "http://localhost:3001";
      const result = await ext.importSession({
        account_id: accountId,
        owner_id: accountId,
        backend_url: bridgeUrl,
        login_timeout_ms: 90_000
      });
      if (result.success) {
        setNotice("Đăng nhập Zalo thành công!");
        setError(null);
      } else {
        setError(result.error || "Đăng nhập thất bại");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi kết nối extension");
    } finally {
      setReimporting(false);
    }
  }

  const [rules, setRules] = useState<ZaloForwardRule[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedLogsFor, setExpandedLogsFor] = useState<number | null>(null);
  const [logsByRule, setLogsByRule] = useState<Record<number, ZaloForwardLog[]>>({});
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [showEditor, setShowEditor] = useState(false);
  const [editingRule, setEditingRule] = useState<ZaloForwardRule | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [rulesRes, convRes] = await Promise.all([
        forwardRulesApi.list(accountId),
        fetch(apiUrl(`/api/conversations?account_id=${encodeURIComponent(accountId)}&limit=500`), {
          cache: "no-store"
        }).then((r) => r.json())
      ]);
      setRules(rulesRes.rules || []);
      type ConvRow = { thread_id: string; thread_type: string; conversation_name: string | null };
      const convs: ConvRow[] = Array.isArray(convRes?.conversations) ? convRes.conversations : [];
      setGroups(
        convs
          .filter((c) => c.thread_type === "group")
          .map((c) => ({ id: c.thread_id, name: c.conversation_name || `Nhóm ${c.thread_id}` }))
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function toggleEnabled(rule: ZaloForwardRule) {
    try {
      await forwardRulesApi.update(rule.id, { is_enabled: !rule.is_enabled });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi cập nhật.");
    }
  }

  async function handleDelete(rule: ZaloForwardRule) {
    if (!confirm(`Xoá luật chuyển tiếp "${rule.name || rule.master_thread_name || rule.master_thread_id}"?`)) return;
    try {
      await forwardRulesApi.remove(rule.id);
      setNotice("Đã xoá luật chuyển tiếp.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi xoá.");
    }
  }

  async function toggleLogs(rule: ZaloForwardRule) {
    if (expandedLogsFor === rule.id) {
      setExpandedLogsFor(null);
      return;
    }
    setExpandedLogsFor(rule.id);
    setLoadingLogs(true);
    try {
      const res = await forwardRulesApi.logs(rule.id, 30);
      setLogsByRule((m) => ({ ...m, [rule.id]: res.logs || [] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải log.");
    } finally {
      setLoadingLogs(false);
    }
  }

  return (
    <div className="flex h-screen min-h-0 flex-col gap-3 p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <a
            href={`${process.env.NEXT_PUBLIC_MAIN_APP_URL || "https://timetech.markeeai.com"}/zalo/chat`}
            className="mb-1 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" /> InvoiceFlow Manager
          </a>
          <h1 className="text-xl font-bold text-slate-900">Chuyển tiếp tin nhắn tự động</h1>
          <p className="text-xs text-slate-500">
            Module riêng — chọn 1 nhóm chính, mọi tin nhắn (text/ảnh/file/sticker) gửi trong nhóm đó sẽ
            tự động chuyển tiếp sang các nhóm đích bên dưới.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StaffBadge />
          <a
            href={ZALO_EXTENSION_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            download="extension-login-zalo.zip"
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title="Tải extension Chrome đăng nhập Zalo về máy"
          >
            <Download className="h-3.5 w-3.5" />
            Tải extension
          </a>
          <span className="text-xs text-slate-400">Tài khoản: {accountLabel || accountId}</span>
          {accountStatus && accountStatus !== "connected" ? (
            <button
              type="button"
              onClick={() => void handleReimport()}
              disabled={reimporting}
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              title="Tài khoản chưa/mất kết nối Zalo — bấm để đăng nhập lại qua extension"
            >
              {reimporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Đăng nhập lại
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Làm mới
          </button>
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                setEditingRule(null);
                setShowEditor(true);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Tạo luật mới
            </button>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="ml-2 underline">
            Đóng
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">
            Đóng
          </button>
        </div>
      ) : null}
      {!canManage ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          Bạn cần quyền admin hoặc quyền "Broadcast" trên tài khoản này để tạo/sửa luật chuyển tiếp.
        </div>
      ) : null}

      <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white">
        {rules.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            {loading ? "Đang tải..." : "Chưa có luật chuyển tiếp nào."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rules.map((rule) => (
              <div key={rule.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => canManage && void toggleEnabled(rule)}
                    disabled={!canManage}
                    title={rule.is_enabled ? "Đang bật — bấm để tắt" : "Đang tắt — bấm để bật"}
                    className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
                      rule.is_enabled ? "bg-emerald-500" : "bg-slate-300"
                    } ${canManage ? "" : "cursor-not-allowed opacity-70"}`}
                  >
                    <span
                      className={`h-4 w-4 rounded-full bg-white shadow transition ${
                        rule.is_enabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Send className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate font-semibold text-slate-900">
                        {rule.name || "Luật chuyển tiếp"}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] text-slate-500">
                      Nhóm chính:{" "}
                      <span className="font-semibold text-slate-700">
                        {rule.master_thread_name || rule.master_thread_id}
                      </span>{" "}
                      → {rule.targets.length} nhóm đích
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/chat?accountId=${encodeURIComponent(rule.account_id)}&threadId=${encodeURIComponent(rule.master_thread_id)}&threadName=${encodeURIComponent(rule.master_thread_name || rule.master_thread_id)}`}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      title="Vào chat với nhóm chính của luật này"
                    >
                      <MessageCircle className="h-3 w-3" />
                      Chat
                    </Link>
                    <button
                      type="button"
                      onClick={() => void toggleLogs(rule)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {expandedLogsFor === rule.id ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      Log
                    </button>
                    {canManage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRule(rule);
                            setShowEditor(true);
                          }}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(rule)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {expandedLogsFor === rule.id ? (
                  <div className="mt-2 max-h-56 overflow-auto rounded-md border border-slate-200 bg-slate-50">
                    {loadingLogs ? (
                      <div className="flex items-center gap-1 px-3 py-3 text-[11px] text-slate-500">
                        <Loader2 className="h-3 w-3 animate-spin" /> Đang tải log...
                      </div>
                    ) : (logsByRule[rule.id] || []).length === 0 ? (
                      <div className="px-3 py-3 text-[11px] text-slate-500">Chưa có log nào.</div>
                    ) : (
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0 bg-slate-100 text-slate-500">
                          <tr>
                            <th className="px-2 py-1.5 text-left font-semibold">Thời gian</th>
                            <th className="px-2 py-1.5 text-left font-semibold">Nhóm đích</th>
                            <th className="px-2 py-1.5 text-left font-semibold">Loại</th>
                            <th className="px-2 py-1.5 text-left font-semibold">Trạng thái</th>
                            <th className="px-2 py-1.5 text-left font-semibold">Lỗi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(logsByRule[rule.id] || []).map((log) => (
                            <tr key={log.id} className="border-t border-slate-200">
                              <td className="px-2 py-1.5 text-slate-500">
                                {new Date(log.created_at).toLocaleString("vi-VN")}
                              </td>
                              <td className="max-w-[220px] truncate px-2 py-1.5 font-mono" title={log.target_thread_id}>
                                {log.target_thread_id}
                              </td>
                              <td className="px-2 py-1.5">{log.content_type}</td>
                              <td className="px-2 py-1.5">
                                <span className={`rounded-full px-1.5 py-0.5 font-semibold ${statusPillCls(log.status)}`}>
                                  {log.status}
                                </span>
                              </td>
                              <td className="max-w-[240px] truncate px-2 py-1.5 text-red-600" title={log.error || ""}>
                                {log.error || ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {showEditor ? (
        <RuleEditorModal
          accountId={accountId}
          groups={groups}
          editingRule={editingRule}
          onClose={() => setShowEditor(false)}
          onSaved={async (msg) => {
            setShowEditor(false);
            setNotice(msg);
            await refresh();
          }}
          onError={(msg) => setError(msg)}
        />
      ) : null}
    </div>
  );
}

function GroupPickerList({
  groups,
  excludeIds,
  mode,
  selectedIds,
  onSelectSingle,
  onToggleMulti
}: {
  groups: GroupOption[];
  excludeIds: Set<string>;
  mode: "single" | "multi";
  selectedIds: Set<string>;
  onSelectSingle?: (id: string) => void;
  onToggleMulti?: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => !excludeIds.has(g.id)).filter((g) => !q || g.name.toLowerCase().includes(q));
  }, [groups, excludeIds, search]);

  return (
    <div className="rounded-md border border-slate-200">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm nhóm..."
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
        />
      </div>
      <div className="max-h-48 overflow-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-slate-500">Không có nhóm phù hợp.</div>
        ) : (
          filtered.map((g) => {
            const checked = selectedIds.has(g.id);
            return (
              <label
                key={g.id}
                className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2.5 py-1.5 text-xs last:border-b-0 hover:bg-slate-50"
              >
                <input
                  type={mode === "single" ? "radio" : "checkbox"}
                  name={mode === "single" ? "master-group" : undefined}
                  checked={checked}
                  onChange={() => (mode === "single" ? onSelectSingle?.(g.id) : onToggleMulti?.(g.id))}
                />
                <span className="truncate">{g.name}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

function RuleEditorModal({
  accountId,
  groups,
  editingRule,
  onClose,
  onSaved,
  onError
}: {
  accountId: string;
  groups: GroupOption[];
  editingRule: ZaloForwardRule | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(editingRule?.name || "");
  const [masterId, setMasterId] = useState(editingRule?.master_thread_id || "");
  const [targetIds, setTargetIds] = useState<Set<string>>(
    new Set((editingRule?.targets || []).map((t) => t.target_thread_id))
  );
  const [saving, setSaving] = useState(false);

  const nameOf = (id: string) => groups.find((g) => g.id === id)?.name || id;

  async function handleSave() {
    if (!masterId) {
      onError("Vui lòng chọn nhóm chính.");
      return;
    }
    if (targetIds.size === 0) {
      onError("Vui lòng chọn ít nhất 1 nhóm đích.");
      return;
    }
    setSaving(true);
    try {
      const targets = Array.from(targetIds).map((id) => ({
        target_thread_id: id,
        target_thread_name: nameOf(id)
      }));
      if (editingRule) {
        await forwardRulesApi.update(editingRule.id, {
          name: name.trim() || null,
          master_thread_id: masterId,
          master_thread_name: nameOf(masterId),
          targets
        });
        onSaved("Đã cập nhật luật chuyển tiếp.");
      } else {
        await forwardRulesApi.create({
          account_id: accountId,
          name: name.trim() || undefined,
          master_thread_id: masterId,
          master_thread_name: nameOf(masterId),
          targets
        });
        onSaved("Đã tạo luật chuyển tiếp.");
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Lỗi lưu luật chuyển tiếp.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[170] grid place-items-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" aria-label="Đóng" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border bg-white shadow-2xl">
        <div className="shrink-0 px-5 pt-5 text-base font-semibold">
          {editingRule ? "Sửa luật chuyển tiếp" : "Tạo luật chuyển tiếp mới"}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Tên luật (tuỳ chọn, vd: Thông báo cửa hàng)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />

            <div>
              <div className="mb-1 text-xs font-semibold text-slate-700">
                Nhóm chính {masterId ? <span className="font-normal text-slate-400">— {nameOf(masterId)}</span> : null}
              </div>
              <GroupPickerList
                groups={groups}
                excludeIds={targetIds}
                mode="single"
                selectedIds={new Set(masterId ? [masterId] : [])}
                onSelectSingle={(id) => setMasterId(id)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold text-slate-700">Nhóm đích ({targetIds.size} đã chọn)</div>
              <GroupPickerList
                groups={groups}
                excludeIds={new Set(masterId ? [masterId] : [])}
                mode="multi"
                selectedIds={targetIds}
                onToggleMulti={(id) =>
                  setTargetIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !masterId || targetIds.size === 0}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
