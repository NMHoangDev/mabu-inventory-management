"use client";

/**
 * Trang "Tài khoản Zalo" — tách từ app/page.tsx cũ (trước đây gộp cả accounts
 * + ma trận phân quyền nhân viên trong 1 trang). Ma trận phân quyền giờ ở
 * route riêng /staff (xem app/(dashboard)/staff/page.tsx) — mỗi mục sidebar
 * ứng với đúng 1 route, không còn 2 section cuộn chung 1 trang.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { apiUrl } from "@/lib/basePath";
import { absoluteBridgeUrl } from "@/lib/zaloApiClient";
import type { StaffRecord, ZaloAccountSummary } from "@/lib/types";
import { alert, btn, btnSize, card, input, label, modal, pageStack, pill, table } from "@/lib/ui";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function statusBadge(status: string) {
  switch (status) {
    case "connected":
      return { label: "Đã kết nối", cls: pill.success };
    case "waiting_qr":
      return { label: "Chờ QR", cls: pill.info };
    case "error":
      return { label: "Lỗi", cls: pill.danger };
    default:
      return { label: "Chưa kết nối", cls: pill.neutral };
  }
}

function statusDot(status: string) {
  const color =
    status === "connected"
      ? "bg-emerald-500"
      : status === "waiting_qr"
        ? "bg-blue-500"
        : status === "error"
          ? "bg-red-500"
          : "bg-slate-400";
  return (
    <span className="relative inline-flex items-center">
      <span className={`absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full opacity-60 ${color}`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<ZaloAccountSummary[]>([]);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ accountId: "", displayName: "" });
  const [creating, setCreating] = useState(false);

  const [editingAccount, setEditingAccount] = useState<ZaloAccountSummary | null>(null);
  const [editForm, setEditForm] = useState({ displayName: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const currentStaffId = useMemo(() => getCookie("current_staff_id"), []);
  const currentStaff = useMemo(() => staff.find((s) => s.id === currentStaffId) || null, [staff, currentStaffId]);
  const isAdmin = !currentStaffId || currentStaff?.role === "admin";

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountsRes, staffRes] = await Promise.all([
        fetch(apiUrl("/api/accounts"), { cache: "no-store" }),
        fetch(apiUrl("/api/staff"), { cache: "no-store" }),
      ]);
      const accountsData = await accountsRes.json().catch(() => ({}));
      const staffData = await staffRes.json().catch(() => ({}));
      setAccounts(Array.isArray(accountsData?.accounts) ? accountsData.accounts : []);
      setStaff(Array.isArray(staffData?.staff) ? staffData.staff : []);
      if (accountsData?.error) setError(accountsData.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  async function handleCreate() {
    const slug = createForm.accountId.trim();
    const name = createForm.displayName.trim();
    if (!slug) {
      setError("Vui lòng nhập accountId (slug không dấu, vd: shop-owner)");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/accounts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: slug, displayName: name || slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setNotice(`Đã tạo tài khoản "${data.account?.display_name || slug}".`);
      setShowCreate(false);
      setCreateForm({ accountId: "", displayName: "" });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được tài khoản.");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(acc: ZaloAccountSummary) {
    setEditingAccount(acc);
    setEditForm({ displayName: acc.display_name, phone: acc.phone || "" });
  }

  async function handleSaveEdit() {
    if (!editingAccount) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/accounts/${encodeURIComponent(editingAccount.account_id)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editForm.displayName.trim() || editingAccount.account_id,
          phone: editForm.phone.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setNotice(`Đã cập nhật tài khoản "${editForm.displayName}".`);
      setEditingAccount(null);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được tài khoản.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(acc: ZaloAccountSummary) {
    if (!window.confirm(`Xoá tài khoản "${acc.display_name}" (${acc.account_id})?`)) return;
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/accounts/${encodeURIComponent(acc.account_id)}`), { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setNotice(`Đã xoá tài khoản "${acc.display_name}".`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xoá được tài khoản.");
    }
  }

  /**
   * "Kết nối lại" — gọi extension lấy cookie mới, gửi cho bridge import-session
   * (bridge tự lưu session khi thành công). Xem lịch sử fix ở commit
   * "fix(zalo): download via API route + fix broken account reconnect".
   */
  async function handleReconnect(acc: ZaloAccountSummary) {
    const extApi = window as unknown as {
      __zaloExtension?: {
        ping: () => Promise<{ installed: boolean; version: string }>;
        importSession: (opts?: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
      };
    };
    const ext = extApi.__zaloExtension;
    if (!ext) {
      setError('Chưa cài extension Zalo. Vào trang Chat để tải extension, cài xong quay lại bấm "Kết nối lại".');
      return;
    }
    setReconnectingId(acc.account_id);
    setError(null);
    try {
      await ext.ping().catch(() => undefined);
      const bridgeUrl = absoluteBridgeUrl();
      const result = await ext.importSession({
        account_id: acc.account_id,
        owner_id: acc.account_id,
        backend_url: bridgeUrl,
        login_timeout_ms: 90_000,
      });
      if (result.success) {
        setNotice(`Đã đăng nhập lại "${acc.display_name}".`);
        await loadAll();
      } else {
        setError(result.error || "Đăng nhập lại thất bại");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi kết nối extension");
    } finally {
      setReconnectingId(null);
    }
  }

  return (
    <div className={pageStack}>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-subtle text-brand">
          <Smartphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tài khoản Zalo</h1>
          <p className="text-sm text-slate-500">Quản lý metadata tài khoản qua zalo-bridge.</p>
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
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Danh sách tài khoản</h2>
            <p className="text-xs text-slate-500">Không thao tác trực tiếp lên WebSocket session.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              className={`${btn.ghost} ${btnSize.icon}`}
              title="Làm mới"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            {isAdmin ? (
              <button type="button" onClick={() => setShowCreate(true)} className={`${btn.primary} ${btnSize.sm}`}>
                <Plus className="h-3.5 w-3.5" />
                Thêm tài khoản
              </button>
            ) : null}
          </div>
        </div>

        <div className={table.wrapper}>
          <table className={table.root}>
            <thead>
              <tr className="border-b border-slate-100">
                <th className={table.head}>Tên hiển thị</th>
                <th className={table.head}>Account ID</th>
                <th className={table.head}>Trạng thái</th>
                <th className={table.head}>Zalo user</th>
                <th className={table.head}>Hoạt động cuối</th>
                <th className={`${table.head} text-right`}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => {
                const badge = statusBadge(acc.status);
                return (
                  <tr key={acc.account_id} className={table.row}>
                    <td className={`${table.cell} font-medium text-slate-900`}>
                      <div className="flex items-center gap-2">
                        {statusDot(acc.status)}
                        {acc.display_name}
                      </div>
                    </td>
                    <td className={`${table.cell} font-mono text-xs text-slate-500`}>{acc.account_id}</td>
                    <td className={table.cell}>
                      <span className={badge.cls}>{badge.label}</span>
                    </td>
                    <td className={`${table.cell} text-xs text-slate-500`}>{acc.zalo_display_name || "—"}</td>
                    <td className={`${table.cell} text-xs text-slate-500`}>
                      {acc.last_seen_at ? new Date(acc.last_seen_at).toLocaleString("vi-VN") : "—"}
                    </td>
                    <td className={table.cell}>
                      <div className="flex items-center justify-end gap-1.5">
                        {acc.status === "connected" ? (
                          <Link
                            href={`/chat?accountId=${encodeURIComponent(acc.account_id)}`}
                            className={`${btn.outline} ${btnSize.sm}`}
                            title={`Vào chat với tài khoản ${acc.display_name || acc.account_id}`}
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Chat
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleReconnect(acc)}
                            disabled={reconnectingId === acc.account_id}
                            className={`${btn.warning} ${btnSize.sm}`}
                            title="Tài khoản chưa/mất kết nối — bấm để đăng nhập lại qua extension"
                          >
                            {reconnectingId === acc.account_id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Kết nối lại
                          </button>
                        )}
                        {isAdmin ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(acc)}
                              className={`${btn.outline} ${btnSize.icon}`}
                              title="Sửa"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(acc)}
                              className={`${btn.danger} ${btnSize.icon}`}
                              title="Xoá"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-500">
                    {loading ? "Đang tải..." : "Chưa có tài khoản Zalo nào."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate ? (
        <div className={`${modal.overlay} flex items-center justify-center`}>
          <div className={`${modal.panel} max-w-sm`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Thêm tài khoản Zalo</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={label}>Account ID (slug)</label>
                <input
                  type="text"
                  value={createForm.accountId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, accountId: e.target.value }))}
                  placeholder="vd: leads-01"
                  className={`${input} font-mono`}
                />
              </div>
              <div>
                <label className={label}>Tên hiển thị</label>
                <input
                  type="text"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="vd: Lead Page 01"
                  className={input}
                />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className={`${btn.outline} ${btnSize.sm}`}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating || !createForm.accountId.trim()}
                className={`${btn.primary} ${btnSize.sm}`}
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Tạo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingAccount ? (
        <div className={`${modal.overlay} flex items-center justify-center`}>
          <div className={`${modal.panel} max-w-sm`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Sửa tài khoản &quot;{editingAccount.account_id}&quot;
              </h3>
              <button type="button" onClick={() => setEditingAccount(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={label}>Tên hiển thị</label>
                <input
                  type="text"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Số điện thoại</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  className={input}
                />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                disabled={saving}
                className={`${btn.outline} ${btnSize.sm}`}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={saving}
                className={`${btn.primary} ${btnSize.sm}`}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Lưu
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
