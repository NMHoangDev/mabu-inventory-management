"use client";

/**
 * Trang "Nhân viên & Phân quyền" — tách từ app/page.tsx cũ (ma trận phân
 * quyền nhân viên × tài khoản Zalo). Đây CŨNG chính là bảng whitelist cho
 * đăng nhập Google (xem app/api/auth/google/route.ts) — thêm nhân viên ở
 * đây bằng đúng email Gmail của họ thì email đó mới đăng nhập Google được.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Loader2, Plus, RefreshCw, ShieldCheck, Users, X } from "lucide-react";
import { apiUrl } from "@/lib/basePath";
import type { StaffAssignment, StaffRecord, ZaloAccountSummary } from "@/lib/types";
import { alert, btn, btnSize, card, input, label, modal, pageStack, pill, select, table } from "@/lib/ui";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function StaffPage() {
  const [accounts, setAccounts] = useState<ZaloAccountSummary[]>([]);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", fullName: "", role: "staff" as "admin" | "staff" });
  const [creating, setCreating] = useState(false);

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
      const accs = Array.isArray(accountsData?.accounts) ? accountsData.accounts : [];
      setAccounts(accs);
      setStaff(Array.isArray(staffData?.staff) ? staffData.staff : []);
      setAssignments(Array.isArray(staffData?.assignments) ? staffData.assignments : []);
      setSelectedAccountId((prev) => prev || accs[0]?.account_id || "");
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

  function assignmentFor(staffId: string, accountId: string): StaffAssignment | undefined {
    return assignments.find((a) => a.staff_id === staffId && a.account_id === accountId);
  }

  async function handleCreateStaff() {
    const email = createForm.email.trim();
    const fullName = createForm.fullName.trim();
    if (!email || !fullName) {
      setError("Vui lòng nhập email và họ tên.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/staff"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, full_name: fullName, role: createForm.role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setNotice(`Đã thêm nhân viên "${fullName}" — có thể đăng nhập bằng email này (Google hoặc mật khẩu).`);
      setShowCreate(false);
      setCreateForm({ email: "", fullName: "", role: "staff" });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thêm được nhân viên.");
    } finally {
      setCreating(false);
    }
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
      [field]: value,
    };
    setAssignments((prev) => {
      const others = prev.filter((a) => !(a.staff_id === staffId && a.account_id === accountId));
      return [...others, { staff_id: staffId, account_id: accountId, ...next }];
    });
    try {
      const res = await fetch(apiUrl(`/api/staff/${encodeURIComponent(staffId)}/assign`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, ...next }),
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
    <div className={pageStack}>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-subtle text-brand">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nhân viên & Phân quyền</h1>
          <p className="text-sm text-slate-500">
            Thêm nhân viên bằng email Gmail để họ đăng nhập được bằng Google — hoặc mật khẩu (đặt ở lần đăng nhập đầu).
          </p>
        </div>
      </div>

      <div className={alert.info}>
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Trang này cũng là <strong>bảng whitelist đăng nhập Google</strong> — chỉ Gmail được thêm ở đây mới đăng
          nhập được bằng Google. Nhân viên chưa có ở đây sẽ bị từ chối đăng nhập.
        </span>
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
            <h2 className="text-lg font-semibold text-slate-900">Danh sách nhân viên</h2>
            <p className="text-xs text-slate-500">{staff.length} nhân viên được cấp quyền truy cập.</p>
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
                Thêm nhân viên
              </button>
            ) : null}
          </div>
        </div>
        <div className={table.wrapper}>
          <table className={table.root}>
            <thead>
              <tr className="border-b border-slate-100">
                <th className={table.head}>Nhân viên</th>
                <th className={table.head}>Vai trò</th>
                <th className={table.head}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className={table.row}>
                  <td className={table.cell}>
                    <div className="font-medium text-slate-900">{s.full_name}</div>
                    <div className="text-xs text-slate-500">{s.email}</div>
                  </td>
                  <td className={table.cell}>
                    <span className={s.role === "admin" ? pill.info : pill.neutral}>
                      {s.role === "admin" ? "Admin" : "Nhân viên"}
                    </span>
                  </td>
                  <td className={table.cell}>
                    <span className={s.is_active ? pill.success : pill.danger}>
                      {s.is_active ? "Đang hoạt động" : "Đã khoá"}
                    </span>
                  </td>
                </tr>
              ))}
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-xs text-slate-500">
                    {loading ? "Đang tải..." : "Chưa có nhân viên nào."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Phân quyền theo tài khoản Zalo</h2>
            <p className="text-xs text-slate-500">Chọn 1 tài khoản Zalo rồi bật/tắt quyền cho từng nhân viên.</p>
          </div>
          <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} className={select}>
            <option value="">— Chọn tài khoản —</option>
            {accounts.map((acc) => (
              <option key={acc.account_id} value={acc.account_id}>
                {acc.display_name} ({acc.account_id})
              </option>
            ))}
          </select>
        </div>

        {!isAdmin ? (
          <div className="px-5 py-8 text-center text-xs text-slate-500">Chỉ admin mới được thay đổi phân quyền nhân viên.</div>
        ) : !selectedAccount ? (
          <div className="px-5 py-8 text-center text-xs text-slate-500">Chọn một tài khoản để xem/sửa quyền.</div>
        ) : (
          <div className={table.wrapper}>
            <table className={table.root}>
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={table.head}>Nhân viên</th>
                  <th className={`${table.head} text-center`}>Xem</th>
                  <th className={`${table.head} text-center`}>Nhắn tin</th>
                  <th className={`${table.head} text-center`}>Broadcast</th>
                  <th className={`${table.head} text-right`}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const a = assignmentFor(s.id, selectedAccount.account_id);
                  const hasAssignment = Boolean(a);
                  return (
                    <tr key={s.id} className={table.row}>
                      <td className={table.cell}>
                        <div className="font-medium text-slate-900">{s.full_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {s.email} · {s.role === "admin" ? "Admin" : "Nhân viên"}
                        </div>
                      </td>
                      {(["can_view", "can_send", "can_broadcast"] as const).map((field) => (
                        <td key={field} className={`${table.cell} text-center`}>
                          <input
                            type="checkbox"
                            checked={Boolean(a?.[field])}
                            disabled={s.role === "admin"}
                            onChange={(e) => void handleToggleAssignment(s.id, selectedAccount.account_id, field, e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand disabled:opacity-40"
                          />
                        </td>
                      ))}
                      <td className={`${table.cell} text-right`}>
                        {hasAssignment ? (
                          <button
                            type="button"
                            onClick={() => void handleRemoveAssignment(s.id, selectedAccount.account_id)}
                            className="text-xs font-semibold text-red-600 hover:text-red-700"
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

      {showCreate ? (
        <div className={`${modal.overlay} flex items-center justify-center`}>
          <div className={`${modal.panel} max-w-sm`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Thêm nhân viên</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={label}>Email (Gmail để đăng nhập Google)</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="ten@gmail.com"
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Họ tên</label>
                <input
                  type="text"
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Vai trò</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as "admin" | "staff" }))}
                  className={`${select} w-full`}
                >
                  <option value="staff">Nhân viên</option>
                  <option value="admin">Admin</option>
                </select>
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
                onClick={() => void handleCreateStaff()}
                disabled={creating || !createForm.email.trim() || !createForm.fullName.trim()}
                className={`${btn.primary} ${btnSize.sm}`}
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Thêm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
