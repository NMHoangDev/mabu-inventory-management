"use client";

/**
 * Port từ services/zalo-forward-module/src/components/ForwardRulesDashboard.tsx
 * — gộp tính năng "Chuyển tiếp" vào module quản lý tập trung (đa tài khoản)
 * theo yêu cầu người dùng, dùng CHUNG bảng zalo_forward_rules/targets/logs
 * với zalo-forward-module (2 nơi cùng 1 nguồn sự thật, không xung đột) và
 * cùng poller đang chạy ở đó (module này chỉ là thêm 1 UI quản lý, KHÔNG chạy
 * poller riêng — tránh 2 tiến trình cùng forward 1 rule, forward trùng 2 lần).
 *
 * Khác bản gốc: module gốc chỉ vận hành 1 tài khoản (tự lấy account duy nhất);
 * module này có NHIỀU tài khoản nên nhận `accountId` qua prop (đọc từ
 * ?accountId= ở trang cha, giống pattern nút "Chat" per-row ở trang accounts).
 */

import {
  AlertTriangle,
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
import { absoluteBridgeUrl } from "@/lib/zaloApiClient";
import type { ZaloForwardRule, ZaloForwardLog } from "@/lib/types";
import { alert, btn, btnSize, card, input, pageStack, pill } from "@/lib/ui";

type GroupOption = { id: string; name: string };

const DEFAULT_ACCOUNT_ID = "shop-owner";

/**
 * Extension "Markee Zalo Personal Connector" — tự host ở public/ của module
 * (same-origin nên thuộc tính `download` mới có tác dụng; link Drive là
 * cross-origin, trình duyệt BỎ QUA `download` và tải về bản .rar CŨ thiếu bản
 * vá manifest cho 10.30.195.41:3002/3003).
 *
 * Lỗi "Không thấy tệp trên trang" trước đó = Chrome SERVER_BAD_CONTENT, tức
 * server trả 404 — do đường dẫn bị đổi/xoá qua lại trong khi trình duyệt vẫn
 * chạy bản trang đã cache trỏ vào đường dẫn cũ. Vì vậy GIỮ SỐNG cả 2 đường
 * dẫn: /extension-login-zalo.zip (tĩnh, dùng ở đây) và /api/download-extension.
 */
const ZALO_EXTENSION_DOWNLOAD_URL = "/extension-login-zalo.zip";

function statusPillCls(status: string) {
  switch (status) {
    case "success":
      return pill.success;
    case "partial":
      return pill.warning;
    case "dry_run":
      return pill.info;
    case "skipped":
      return pill.neutral;
    default:
      return pill.danger;
  }
}

export default function ForwardRulesDashboard({
  role,
  accountId: accountIdProp
}: {
  role: "admin" | "staff";
  /** Từ ?accountId= ở trang cha — module này đa tài khoản, không tự đoán. */
  accountId?: string;
}) {
  const accountId = accountIdProp || DEFAULT_ACCOUNT_ID;
  const [accountLabel, setAccountLabel] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [reimporting, setReimporting] = useState(false);
  const canManage = role === "admin";

  // Poll trạng thái ĐÚNG tài khoản đang chọn (không tự đổi accountId — khác
  // bản gốc chỉ có 1 account) để nút "Đăng nhập lại" tự ẩn/hiện theo kết nối
  // thật.
  useEffect(() => {
    let cancelled = false;
    async function pollAccount() {
      try {
        const res = await fetch(apiUrl("/api/accounts"), { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data?.accounts) ? data.accounts : [];
        const match = list.find((a: { account_id?: string }) => a.account_id === accountId) || list[0] || null;
        if (match) {
          setAccountLabel(match.display_name || match.account_id);
          setAccountStatus(match.status || null);
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
  }, [accountId]);

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
      const bridgeUrl = absoluteBridgeUrl();
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
        fetch(apiUrl(`/api/zalo/conversations?account_id=${encodeURIComponent(accountId)}&limit=500`), {
          cache: "no-store"
        }).then((r) => (r.ok ? r.json() : Promise.resolve({})))
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
    <div className={pageStack}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-white">
            <Send className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Chuyển tiếp tin nhắn tự động</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Chọn 1 nhóm chính, mọi tin nhắn (text/ảnh/file/sticker) gửi trong nhóm đó sẽ tự động chuyển
              tiếp sang các nhóm đích bên dưới.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={ZALO_EXTENSION_DOWNLOAD_URL}
            download="extension-login-zalo.zip"
            className={`${btn.outline} ${btnSize.sm}`}
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
              className={`${btn.warning} ${btnSize.sm}`}
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
            className={`${btn.outline} ${btnSize.sm}`}
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
              className={`${btn.primary} ${btnSize.sm}`}
            >
              <Plus className="h-3.5 w-3.5" />
              Tạo luật mới
            </button>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div className={alert.success}>
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold underline">
            Đóng
          </button>
        </div>
      ) : null}
      {error ? (
        <div className={alert.error}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs font-semibold underline">
            Đóng
          </button>
        </div>
      ) : null}
      {!canManage ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Bạn cần quyền admin hoặc quyền &quot;Broadcast&quot; trên tài khoản này để tạo/sửa luật chuyển tiếp.</span>
        </div>
      ) : null}

      <section className={`${card} min-h-0 flex-1 overflow-auto`}>
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
                      rule.is_enabled ? "bg-brand" : "bg-slate-300"
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
                      <Send className="h-3.5 w-3.5 shrink-0 text-brand" />
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
                                <span className={statusPillCls(log.status)}>{log.status}</span>
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
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm nhóm..."
          className="w-full bg-transparent text-xs text-slate-900 outline-none placeholder:text-slate-400"
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
                  className="accent-brand"
                />
                <span className="truncate text-slate-700">{g.name}</span>
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
    <div className="fixed inset-0 z-[170] grid place-items-center bg-black/50 px-4">
      <button type="button" className="absolute inset-0" aria-label="Đóng" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="shrink-0 px-5 pt-5 text-base font-semibold text-slate-900">
          {editingRule ? "Sửa luật chuyển tiếp" : "Tạo luật chuyển tiếp mới"}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Tên luật (tuỳ chọn, vd: Thông báo cửa hàng)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={input}
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
          <button type="button" onClick={onClose} className={`${btn.outline} ${btnSize.sm}`}>
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !masterId || targetIds.size === 0}
            className={`${btn.primary} ${btnSize.sm}`}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
