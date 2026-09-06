"use client";

/**
 * Trang admin duy nhất của module: bảng tài khoản Zalo + ma trận phân quyền
 * nhân viên × tài khoản.
 *
 * Không có route "/api/me" riêng — để biết staff hiện tại có phải admin hay
 * không (quyết định hiện nút sửa/xoá/gán quyền), đọc cookie
 * `current_staff_id` rồi đối chiếu với danh sách trả về từ GET /api/staff
 * (route đó vốn không check quyền, trả về toàn bộ staff kèm role — giống hệt
 * hành vi gốc app/api/zalo/staff/route.ts).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MessageCircle, Plus, RefreshCw, X, Check, Pencil, Trash2 } from "lucide-react";
import { apiUrl } from "@/lib/basePath";
import type { StaffAssignment, StaffRecord, ZaloAccountSummary } from "@/lib/types";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function statusBadge(status: string) {
  switch (status) {
    case "connected":
      return { label: "Đã kết nối", cls: "bg-emerald-50 text-emerald-700" };
    case "waiting_qr":
      return { label: "Chờ QR", cls: "bg-blue-50 text-blue-700" };
    case "error":
      return { label: "Lỗi", cls: "bg-red-50 text-red-700" };
    default:
      return { label: "Chưa kết nối", cls: "bg-slate-100 text-slate-600" };
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

export default function HomePage() {
  const [accounts, setAccounts] = useState<ZaloAccountSummary[]>([]);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ accountId: "", displayName: "" });
  const [creating, setCreating] = useState(false);

  const [editingAccount, setEditingAccount] = useState<ZaloAccountSummary | null>(null);
  const [editForm, setEditForm] = useState({ displayName: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const currentStaffId = useMemo(() => getCookie("current_staff_id"), []);
  const currentStaff = useMemo(
    () => staff.find((s) => s.id === currentStaffId) || null,
    [staff, currentStaffId]
  );
  // Không có cookie (fallback "system admin" ở tầng API) → coi UI là admin;
  // có cookie → chỉ admin thật (role === "admin") mới thấy control quản trị.
  const isAdmin = !currentStaffId || currentStaff?.role === "admin";

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountsRes, staffRes] = await Promise.all([
        fetch(apiUrl("/api/accounts"), { cache: "no-store" }),
        fetch(apiUrl("/api/staff"), { cache: "no-store" })
      ]);
      const accountsData = await accountsRes.json().catch(() => ({}));
      const staffData = await staffRes.json().catch(() => ({}));
      setAccounts(Array.isArray(accountsData?.accounts) ? accountsData.accounts : []);
      setStaff(Array.isArray(staffData?.staff) ? staffData.staff : []);
      setAssignments(Array.isArray(staffData?.assignments) ? staffData.assignments : []);
      if (accountsData?.error) setError(accountsData.error);
      setSelectedAccountId((prev) => {
        if (prev) return prev;
        const list = Array.isArray(accountsData?.accounts) ? accountsData.accounts : [];
        return list[0]?.account_id || "";
      });
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
        body: JSON.stringify({ accountId: slug, displayName: name || slug })
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
          phone: editForm.phone.trim() || null
        })
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
      const res = await fetch(apiUrl(`/api/accounts/${encodeURIComponent(acc.account_id)}`), {
        method: "DELETE"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setNotice(`Đã xoá tài khoản "${acc.display_name}".`);
      if (selectedAccountId === acc.account_id) setSelectedAccountId("");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xoá được tài khoản.");
    }
  }

  /**
   * "Kết nối lại" — trước đây gọi /api/accounts/[id]/reconnect (proxy tới
   * bridge POST /auth/reconnect) — route đó KHÔNG TỒN TẠI trên bridge (bridge
   * chỉ có /api/all-platform/zalo/auth/reconnect, và endpoint đó chỉ restart
   * WS bằng credential ĐÃ LƯU, không giúp gì khi session thật sự hết hạn) →
   * luôn 404. Đổi hẳn sang cùng cơ chế "Đăng nhập Zalo" của ZaloAuthCard: gọi
   * extension lấy cookie mới từ Zalo Web, gửi cho bridge import-session —
   * bridge tự lưu session (disk + Supabase zalo_accounts) khi import thành
   * công.
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
      const bridgeUrl = process.env.NEXT_PUBLIC_ZALO_BRIDGE_URL || "http://localhost:3001";
      const result = await ext.importSession({
        account_id: acc.account_id,
        owner_id: acc.account_id,
        backend_url: bridgeUrl,
        login_timeout_ms: 90_000
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

  function assignmentFor(staffId: string, accountId: string): StaffAssignment | undefined {
    return assignments.find((a) => a.staff_id === staffId && a.account_id === accountId);
  }

  async function handleToggleAssignment(
    staffId: string,
    accountId: string,
    field: "can_view" | "can_send" | "can_broadcast",
    value: boolean
  ) {
    const current = assignmentFor(staffId, accountId);
    const next = {
      can_view: current?.can_view ?? true,
      can_send: current?.can_send ?? true,
      can_broadcast: current?.can_broadcast ?? false,
      [field]: value
    };
    // Optimistic update.
    setAssignments((prev) => {
      const others = prev.filter((a) => !(a.staff_id === staffId && a.account_id === accountId));
      return [...others, { staff_id: staffId, account_id: accountId, ...next }];
    });
    try {
      const res = await fetch(apiUrl(`/api/staff/${encodeURIComponent(staffId)}/assign`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, ...next })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được phân quyền.");
      await loadAll();
    }
  }

  async function handleRemoveAssignment(staffId: string, accountId: string) {
    setAssignments((prev) => prev.filter((a) => !(a.staff_id === staffId && a.account_id === accountId)));
    try {
      const res = await fetch(
        apiUrl(`/api/staff/${encodeURIComponent(staffId)}/assign?account_id=${encodeURIComponent(accountId)}`),
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gỡ được phân quyền.");
      await loadAll();
    }
  }

  const selectedAccount = accounts.find((a) => a.account_id === selectedAccountId) || null;

  return (
    <div className="space-y-8">
      {error ? (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-emerald-400 hover:text-emerald-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* ── Accounts table ─────────────────────────────────────────────── */}
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Tài khoản Zalo</h2>
            <p className="text-xs text-slate-500">
              Metadata quản lý qua zalo-bridge. Không thao tác trực tiếp lên WebSocket session.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Làm mới"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm tài khoản
              </button>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase text-slate-500">
                <th className="px-4 py-2 font-semibold">Tên hiển thị</th>
                <th className="px-4 py-2 font-semibold">Account ID</th>
                <th className="px-4 py-2 font-semibold">Trạng thái</th>
                <th className="px-4 py-2 font-semibold">Zalo user</th>
                <th className="px-4 py-2 font-semibold">Hoạt động cuối</th>
                <th className="px-4 py-2 font-semibold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => {
                const badge = statusBadge(acc.status);
                return (
                  <tr key={acc.account_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        {statusDot(acc.status)}
                        {acc.display_name}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{acc.account_id}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{acc.zalo_display_name || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {acc.last_seen_at ? new Date(acc.last_seen_at).toLocaleString("vi-VN") : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {acc.status === "connected" ? (
                          <Link
                            href={`/chat?accountId=${encodeURIComponent(acc.account_id)}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            title={`Vào chat với tài khoản ${acc.display_name || acc.account_id}`}
                          >
                            <MessageCircle className="h-3 w-3" />
                            Chat
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleReconnect(acc)}
                            disabled={reconnectingId === acc.account_id}
                            className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                            title="Tài khoản chưa/mất kết nối — bấm để đăng nhập lại qua extension"
                          >
                            {reconnectingId === acc.account_id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Kết nối lại
                          </button>
                        )}
                        {isAdmin ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(acc)}
                              className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100"
                              title="Sửa"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(acc)}
                              className="rounded-md border border-slate-200 p-1.5 text-red-500 hover:bg-red-50"
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
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                    {loading ? "Đang tải..." : "Chưa có tài khoản Zalo nào."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Staff × Account assignment matrix ─────────────────────────── */}
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Phân quyền nhân viên</h2>
            <p className="text-xs text-slate-500">Chọn 1 tài khoản Zalo rồi bật/tắt quyền cho từng nhân viên.</p>
          </div>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="">— Chọn tài khoản —</option>
            {accounts.map((acc) => (
              <option key={acc.account_id} value={acc.account_id}>
                {acc.display_name} ({acc.account_id})
              </option>
            ))}
          </select>
        </div>

        {!isAdmin ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500">
            Chỉ admin mới được thay đổi phân quyền nhân viên.
          </div>
        ) : !selectedAccount ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500">Chọn một tài khoản để xem/sửa quyền.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase text-slate-500">
                  <th className="px-4 py-2 font-semibold">Nhân viên</th>
                  <th className="px-4 py-2 text-center font-semibold">Xem</th>
                  <th className="px-4 py-2 text-center font-semibold">Nhắn tin</th>
                  <th className="px-4 py-2 text-center font-semibold">Broadcast</th>
                  <th className="px-4 py-2 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const a = assignmentFor(s.id, selectedAccount.account_id);
                  const hasAssignment = Boolean(a);
                  return (
                    <tr key={s.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">{s.full_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {s.email} · {s.role === "admin" ? "Admin" : "Nhân viên"}
                        </div>
                      </td>
                      {(["can_view", "can_send", "can_broadcast"] as const).map((field) => (
                        <td key={field} className="px-4 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(a?.[field])}
                            disabled={s.role === "admin"}
                            onChange={(e) =>
                              void handleToggleAssignment(s.id, selectedAccount.account_id, field, e.target.checked)
                            }
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right">
                        {hasAssignment ? (
                          <button
                            type="button"
                            onClick={() => void handleRemoveAssignment(s.id, selectedAccount.account_id)}
                            className="text-xs font-semibold text-red-500 hover:text-red-700"
                          >
                            Gỡ quyền
                          </button>
                        ) : s.role === "admin" ? (
                          <span className="text-[11px] text-slate-400">Toàn quyền (admin)</span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Chưa gán</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {staff.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                      {loading ? "Đang tải..." : "Chưa có nhân viên nào."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Create account modal ───────────────────────────────────────── */}
      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Thêm tài khoản Zalo</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Account ID (slug)</label>
                <input
                  type="text"
                  value={createForm.accountId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, accountId: e.target.value }))}
                  placeholder="vd: leads-01"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Tên hiển thị</label>
                <input
                  type="text"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="vd: Lead Page 01"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating || !createForm.accountId.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Tạo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Edit account modal ─────────────────────────────────────────── */}
      {editingAccount ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Sửa tài khoản "{editingAccount.account_id}"
              </h3>
              <button type="button" onClick={() => setEditingAccount(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Tên hiển thị</label>
                <input
                  type="text"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Số điện thoại</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                disabled={saving}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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
