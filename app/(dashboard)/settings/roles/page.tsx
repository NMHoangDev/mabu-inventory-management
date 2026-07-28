"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Plus } from "lucide-react";

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  active_staff_count: number;
  inactive_staff_count: number;
  created_at: string;
  updated_at: string;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

export default function RolesListPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/roles")
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) throw new Error(data.error);
        setRoles(data.roles ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được danh sách vai trò."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Quay lại Cài đặt
          </Link>
          <h2 className="mt-1 text-2xl font-semibold">Vai trò và phân quyền</h2>
        </div>
        <Link
          href="/settings/roles/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Thêm vai trò
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
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
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Nhân viên Đang làm việc</th>
                <th className="px-4 py-3">Nhân viên Đã nghỉ việc</th>
                <th className="px-4 py-3">Ngày tạo</th>
                <th className="px-4 py-3">Ngày cập nhật cuối</th>
                <th className="px-4 py-3">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/settings/roles/${role.id}`} className="font-medium text-primary hover:underline">
                      {role.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{role.active_staff_count}</td>
                  <td className="px-4 py-3">{role.inactive_staff_count}</td>
                  <td className="px-4 py-3">{formatDate(role.created_at)}</td>
                  <td className="px-4 py-3">{formatDate(role.updated_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{role.description || ""}</td>
                </tr>
              ))}
              {roles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Chưa có vai trò nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
