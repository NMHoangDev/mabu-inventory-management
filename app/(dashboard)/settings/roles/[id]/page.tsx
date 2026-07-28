"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Save, Trash2 } from "lucide-react";
import { RolePermissionEditor } from "@/components/settings/RolePermissionEditor";

export default function EditRolePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/settings/roles/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) throw new Error(data.error);
        setName(data.name ?? "");
        setDescription(data.description ?? "");
        setPermissions(new Set<string>(data.permission_keys ?? []));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được vai trò."))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleSave() {
    if (!name.trim()) {
      setError("Tên vai trò là bắt buộc.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/settings/roles/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          permission_keys: Array.from(permissions)
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Không lưu được vai trò.");
      router.push("/settings/roles");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi lưu vai trò.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Xoá vai trò "${name}"? Hành động này không thể hoàn tác.`)) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/settings/roles/${params.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Không xoá được vai trò.");
      router.push("/settings/roles");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi xoá vai trò.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/settings/roles" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Quay lại Danh sách vai trò
          </Link>
          <h2 className="mt-1 text-2xl font-semibold">{name}</h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3.5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Xoá
          </button>
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
