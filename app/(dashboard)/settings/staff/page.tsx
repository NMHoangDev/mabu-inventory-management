"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, KeyRound, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "staff";
  role_id: string | null;
  role_name: string | null;
  is_active: boolean;
}

interface RoleOption {
  id: string;
  name: string;
}

type FormState = {
  email: string;
  full_name: string;
  role_id: string;
  role: "admin" | "staff";
  is_active: boolean;
  password: string;
};

const EMPTY_FORM: FormState = { email: "", full_name: "", role_id: "", role: "staff", is_active: true, password: "" };

export default function StaffManagementPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [staffRes, rolesRes] = await Promise.all([
        fetch("/api/settings/staff").then((r) => r.json()),
        fetch("/api/settings/roles").then((r) => r.json())
      ]);
      if (staffRes?.error) throw new Error(staffRes.error);
      setStaff(staffRes.staff ?? []);
      setRoles((rolesRes.roles ?? []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách nhân viên.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(row: StaffRow) {
    setEditing(row);
    setForm({
      email: row.email,
      full_name: row.full_name,
      role_id: row.role_id || "",
      role: row.role,
      is_active: row.is_active,
      password: ""
    });
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.email.trim() || !form.full_name.trim()) {
      setError("Email và họ tên là bắt buộc.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        role_id: form.role_id || null,
        role: form.role,
        ...(editing ? { is_active: form.is_active } : { password: form.password || undefined })
      };
      const res = await fetch(editing ? `/api/settings/staff/${editing.id}` : "/api/settings/staff", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Không lưu được nhân viên.");
      setNotice(editing ? `Đã cập nhật "${form.full_name}".` : `Đã thêm nhân viên "${form.full_name}".`);
      setShowModal(false);
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi lưu nhân viên.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: StaffRow) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/settings/staff/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !row.is_active })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Không đổi được trạng thái.");
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi đổi trạng thái.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetPassword(row: StaffRow) {
    if (!confirm(`Đặt lại mật khẩu cho "${row.full_name}"? Lần đăng nhập kế tiếp sẽ đặt mật khẩu mới.`)) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/settings/staff/${row.id}/reset-password`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Không đặt lại được mật khẩu.");
      setNotice(`Đã đặt lại mật khẩu cho "${row.full_name}".`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi đặt lại mật khẩu.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(row: StaffRow) {
    if (!confirm(`Xoá nhân viên "${row.full_name}"? Hành động này không thể hoàn tác.`)) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/settings/staff/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Không xoá được nhân viên.");
      setNotice(`Đã xoá nhân viên "${row.full_name}".`);
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi xoá nhân viên.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Quay lại Cài đặt
          </Link>
          <h2 className="mt-1 text-2xl font-semibold">Nhân viên</h2>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Thêm nhân viên
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>
      ) : null}

      <div className="panel overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Nhân viên</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.full_name}</div>
                    <div className="text-xs text-muted-foreground">{row.email}</div>
                  </td>
                  <td className="px-4 py-3">{row.role_name || <span className="text-muted-foreground">Chưa gán</span>}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => toggleActive(row)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        row.is_active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.is_active ? "Đang làm việc" : "Đã nghỉ việc"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        title="Đặt lại mật khẩu"
                        disabled={busyId === row.id}
                        onClick={() => handleResetPassword(row)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Sửa"
                        onClick={() => openEdit(row)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Xoá"
                        disabled={busyId === row.id}
                        onClick={() => handleDelete(row)}
                        className="rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Chưa có nhân viên nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      {showModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 px-4 backdrop-blur-sm">
          <button type="button" className="absolute inset-0" aria-label="Đóng" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{editing ? "Sửa nhân viên" : "Thêm nhân viên"}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="rounded p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Họ tên *</label>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Email *</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              {!editing ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Mật khẩu (tuỳ chọn)</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Bỏ trống để đặt khi đăng nhập lần đầu"
                    className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Vai trò nghiệp vụ</label>
                <select
                  value={form.role_id}
                  onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">— Chưa gán —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Quyền hệ thống Zalo <span className="text-muted-foreground">(chỉ ảnh hưởng module Zalo, không liên quan vai trò nghiệp vụ)</span>
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "admin" | "staff" }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="staff">staff</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              {editing ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-input"
                  />
                  Đang làm việc
                </label>
              ) : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Lưu
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
