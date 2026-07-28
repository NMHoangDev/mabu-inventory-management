"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Save } from "lucide-react";
import { RolePermissionEditor } from "@/components/settings/RolePermissionEditor";

export default function NewRolePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) {
      setError("Tên vai trò là bắt buộc.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          permission_keys: Array.from(permissions)
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Không tạo được vai trò.");
      router.push(`/settings/roles/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi lưu vai trò.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/settings/roles" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Quay lại Danh sách vai trò
          </Link>
          <h2 className="mt-1 text-2xl font-semibold">Thêm vai trò</h2>
        </div>
        <div className="flex gap-2">
          <Link href="/settings/roles" className="rounded-md border px-3.5 py-2 text-sm font-semibold hover:bg-muted">
            Thoát
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="panel space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tên vai trò *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Ví dụ: Nhân viên kế toán"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Ghi chú</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <h3 className="mb-1 text-sm font-semibold">Phân quyền chi tiết</h3>
        <RolePermissionEditor value={permissions} onChange={setPermissions} />
      </div>
    </section>
  );
}
