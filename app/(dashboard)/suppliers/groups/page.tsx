"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ArrowUpDown, Trash2, Pencil } from "lucide-react";
import { SupplierGroupFormModal, SupplierGroupFormData } from "./SupplierGroupFormModal";
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { PageGuard } from "@/components/auth/PageGuard";

interface SupplierGroup extends SupplierGroupFormData {
  id: string;
  supplier_count: number;
  created_at: string;
}

export default function SupplierGroupsPage() {
  const { hasPermission } = usePermissions();
  const [groups, setGroups] = useState<SupplierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<(SupplierGroupFormData & { id: string }) | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "count">("name");

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/supplier-groups");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tải danh sách thất bại.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const sorted = [...groups].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return b.supplier_count - a.supplier_count;
  });

  function openCreate() {
    setEditGroup(undefined);
    setFormOpen(true);
  }

  function openEdit(g: SupplierGroup) {
    setEditGroup({
      id: g.id,
      name: g.name,
      code: g.code,
      type: g.type,
      description: g.description,
    });
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/supplier-groups/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Xoá thất bại.");
      }
      await fetchGroups();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xoá thất bại.");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  function fmtDate(iso: string) {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  }

  return (
    <PageGuard permission="suppliers.view">
    <div className="space-y-4">
      <div className="flex justify-end">
        {hasPermission("suppliers.create") ? (
          <button
            onClick={openCreate}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow-sm text-sm font-medium flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" />
            Thêm nhóm nhà cung cấp
          </button>
        ) : null}
      </div>

      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <th className="px-6 py-4 border-b border-gray-200">
                <button onClick={() => setSortBy("name")} className="flex items-center gap-1 hover:text-gray-800 transition">
                  Tên nhóm
                  <ArrowUpDown className="w-3 h-3 text-gray-400" />
                </button>
              </th>
              <th className="px-6 py-4 border-b border-gray-200">Mã nhóm</th>
              <th className="px-6 py-4 border-b border-gray-200">Loại nhóm</th>
              <th className="px-6 py-4 border-b border-gray-200">Mô tả</th>
              <th className="px-6 py-4 border-b border-gray-200 text-right">
                <button onClick={() => setSortBy("count")} className="flex items-center gap-1 ml-auto hover:text-gray-800 transition">
                  Số lượng NCC
                  <ArrowUpDown className="w-3 h-3 text-gray-400" />
                </button>
              </th>
              <th className="px-6 py-4 border-b border-gray-200 text-right">Ngày tạo</th>
              <th className="px-6 py-4 border-b border-gray-200 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="text-sm text-gray-700">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-400">Đang tải...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-red-500">{error}</td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                  Chưa có nhóm nhà cung cấp nào. Nhấn "Thêm nhóm nhà cung cấp" để bắt đầu.
                </td>
              </tr>
            ) : (
              sorted.map((g) => (
                <tr key={g.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-0 transition">
                  <td onClick={() => openEdit(g)} className="px-6 py-4 text-blue-600 font-medium cursor-pointer">{g.name}</td>
                  <td onClick={() => openEdit(g)} className="px-6 py-4 cursor-pointer">{g.code || "—"}</td>
                  <td onClick={() => openEdit(g)} className="px-6 py-4 cursor-pointer">{g.type}</td>
                  <td onClick={() => openEdit(g)} className="px-6 py-4 text-gray-500 cursor-pointer">
                    {g.description || <span className="text-gray-300">—</span>}
                  </td>
                  <td onClick={() => openEdit(g)} className="px-6 py-4 text-right cursor-pointer">
                    <span className={`font-medium ${g.supplier_count > 0 ? "text-gray-900" : "text-gray-400"}`}>
                      {g.supplier_count}
                    </span>
                  </td>
                  <td onClick={() => openEdit(g)} className="px-6 py-4 text-right cursor-pointer">{fmtDate(g.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {hasPermission("suppliers.edit") ? (
                        <button onClick={(e) => { e.stopPropagation(); openEdit(g); }} className="text-gray-400 hover:text-blue-600 transition" title="Chỉnh sửa">
                          <Pencil className="w-4 h-4" />
                        </button>
                      ) : null}
                      {hasPermission("suppliers.delete") ? (
                        <button onClick={(e) => { e.stopPropagation(); setDeleteId(g.id); }} className="text-gray-400 hover:text-red-600 transition" title="Xoá">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SupplierGroupFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => fetchGroups()}
        initialData={editGroup}
      />

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">Xác nhận xoá</h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600">
                Bạn có chắc muốn xoá nhóm nhà cung cấp này? Các nhà cung cấp thuộc nhóm sẽ không còn liên kết nhóm.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 font-medium text-sm transition">
                Huỷ
              </button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium text-sm transition disabled:opacity-50">
                {deleting ? "Đang xoá..." : "Xoá"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PageGuard>
  );
}
