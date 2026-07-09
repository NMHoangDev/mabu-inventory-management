"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  Download,
  Upload,
  X,
  Users,
  KeyRound,
} from "lucide-react";
import { downloadCsv } from "@/lib/shared/csv-export";
import { CustomerAddress, CustomerFormData, CustomerFormModal } from "./CustomerFormModal";

interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  gender: string;
  birthday: string;
  company: string;
  tax_code: string;
  website: string;
  description: string;
  tags: string[];
  group_id: string;
  group_name?: string;
  assigner_id: string;
  total_spent: number;
  total_orders: number;
  total_debt: number;
  last_order_at: string;
  created_at: string;
  updated_at: string;
  default_address?: CustomerAddress;
  has_account?: boolean;
}

interface CustomerGroup {
  id: string;
  name: string;
}

type Tab = "all" | "transacting";

interface SortState {
  field: "name" | "total_spent";
  asc: boolean;
}

function fmt(v: number) {
  return new Intl.NumberFormat("vi-VN").format(v);
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<SortState>({ field: "name", asc: true });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Partial<CustomerFormData & { id: string }> | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const fetchCustomers = useCallback(async (overrideSearch?: string, overrideGroup?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      const s = overrideSearch ?? search;
      const g = overrideGroup ?? selectedGroup;
      if (s) params.set("search", s);
      if (g) params.set("group_id", g);
      params.set("tab", tab);
      const res = await fetch(`/api/customers?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCustomers(data.customers ?? []);
      setGroups(data.groups ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tải danh sách thất bại.");
    } finally {
      setLoading(false);
    }
  }, [search, selectedGroup, tab]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Debounced search
  function handleSearchInput(val: string) {
    setSearch(val);
    setPage(1);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchCustomers(val, selectedGroup);
    }, 350);
  }

  function handleGroupChange(g: string) {
    setSelectedGroup(g);
    setPage(1);
    fetchCustomers(search, g);
  }

  function handleTabChange(t: Tab) {
    setTab(t);
    setPage(1);
  }

  // Sort + paginate
  const filtered = customers.filter((c) => {
    if (tab === "transacting") {
      return c.total_orders > 0 || c.total_spent > 0;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const va = sort.field === "name" ? a.name : a.total_spent;
    const vb = sort.field === "name" ? b.name : b.total_spent;
    if (typeof va === "string" && typeof vb === "string") {
      return sort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sort.asc ? Number(va) - Number(vb) : Number(vb) - Number(va);
  });

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSlice = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(field: SortState["field"]) {
    setSort((s) => ({ field, asc: s.field === field ? !s.asc : field === "name" }));
    setPage(1);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === pageSlice.length
        ? new Set()
        : new Set(pageSlice.map((c) => c.id))
    );
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      await fetchCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xoá thất bại.");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  async function handleResetPassword(customer: Customer) {
    if (!window.confirm(`Đặt lại mật khẩu tài khoản website của "${customer.name}"? Khách sẽ cần đăng ký lại mật khẩu mới bằng đúng số điện thoại này.`)) return;
    setResettingId(customer.id);
    try {
      const res = await fetch(`/api/customers/${customer.id}/reset-password`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Đặt lại mật khẩu thất bại.");
      }
      await fetchCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đặt lại mật khẩu thất bại.");
    } finally {
      setResettingId(null);
    }
  }

  function openEdit(customer: Customer) {
    setEditCustomer({
      ...customer,
      gender: customer.gender as CustomerFormData["gender"],
      tags: Array.isArray(customer.tags) ? (customer.tags as string[]).join(",") : "",
      addresses: customer.default_address
        ? [{ ...customer.default_address, address_type: "shipping" as const }]
        : [],
    } as unknown as Partial<CustomerFormData & { id: string }>);
    setFormOpen(true);
  }

  function openCreate() {
    setEditCustomer(undefined);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Action toolbar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button
            onClick={() =>
              downloadCsv(`khach-hang-${Date.now()}.csv`, sorted, [
                { label: "Mã khách hàng", value: (r) => r.code },
                { label: "Tên khách hàng", value: (r) => r.name },
                { label: "Số điện thoại", value: (r) => r.phone },
                { label: "Nhóm khách hàng", value: (r) => r.group_name },
                { label: "Công nợ hiện tại", value: (r) => r.total_debt },
                { label: "Tổng chi tiêu", value: (r) => r.total_spent },
              ])
            }
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition"
          >
            <Download className="w-4 h-4" />
            Xuất file
          </button>
          <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition">
            <Upload className="w-4 h-4" />
            Nhập file
          </button>
        </div>
        <button
          onClick={openCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition font-medium text-sm shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Thêm khách hàng
        </button>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {(["all", "transacting"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`px-6 py-3 text-sm font-medium transition border-b-2 ${
                tab === t
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
            >
              {t === "all" ? "Tất cả khách hàng" : "Đang giao dịch"}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="p-4 flex items-center gap-3 border-b border-gray-100">
          <div className="relative flex-1 max-w-lg">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder="Tìm kiếm theo mã khách hàng, tên, SĐT khách hàng"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {search && (
              <button
                onClick={() => handleSearchInput("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <select
            value={selectedGroup}
            onChange={(e) => handleGroupChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Tất cả nhóm</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-gray-50 border-b text-gray-700">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={pageSlice.length > 0 && selected.size === pageSlice.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">Mã khách hàng</th>
                <th className="px-4 py-3 font-semibold">
                  <button
                    onClick={() => toggleSort("name")}
                    className="flex items-center gap-1 group"
                  >
                    Tên khách hàng
                    {sort.field === "name" ? (
                      sort.asc ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 opacity-0 group-hover:opacity-100" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">Số điện thoại</th>
                <th className="px-4 py-3 font-semibold">Nhóm khách hàng</th>
                <th className="px-4 py-3 font-semibold">Tài khoản web</th>
                <th className="px-4 py-3 font-semibold text-right">
                  <button
                    onClick={() => toggleSort("total_spent")}
                    className="flex items-center gap-1 ml-auto group"
                  >
                    Công nợ hiện tại
                    {sort.field === "total_spent" ? (
                      sort.asc ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 opacity-0 group-hover:opacity-100" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold text-right">Tổng chi tiêu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Đang tải...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-red-500">{error}</td>
                </tr>
              ) : pageSlice.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>Không tìm thấy khách hàng nào.</p>
                  </td>
                </tr>
              ) : (
                pageSlice.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => openEdit(c)}
                    className="hover:bg-gray-50 cursor-pointer transition"
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-blue-600 font-medium">{c.code || "—"}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.phone || "—"}</td>
                    <td className="px-4 py-3">
                      {c.group_name ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {c.group_name}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-700">
                      {c.total_debt > 0 ? (
                        <span className="text-red-500">{fmt(c.total_debt)}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {c.total_spent > 0 ? fmt(c.total_spent) : ""}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {c.has_account ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            Đã có
                          </span>
                          <button
                            onClick={() => handleResetPassword(c)}
                            disabled={resettingId === c.id}
                            title="Đặt lại mật khẩu tài khoản website"
                            className="text-gray-400 hover:text-blue-600 disabled:opacity-50"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">Chưa có</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Hiển thị</span>
            <select
              value={PAGE_SIZE}
              className="border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <span>kết quả</span>
            {total > 0 && (
              <span className="pl-4">
                Từ {(page - 1) * PAGE_SIZE + 1} đến {Math.min(page * PAGE_SIZE, total)} trên tổng {total}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronUp className="w-4 h-4 rotate-[-90deg]" />
            </button>
            {Array.from({ length: Math.min(pageCount, 6) }, (_, i) => {
              const p = pageCount <= 6 ? i + 1 : page <= 3 ? i + 1 : page >= pageCount - 2 ? pageCount - 5 + i : page - 2 + i;
              if (p < 1 || p > pageCount) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 flex items-center justify-center rounded text-sm font-medium transition ${
                    page === p
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page === pageCount}
              className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
            </button>
          </div>
        </div>
      </div>

      {/* Customer form modal */}
      <CustomerFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => fetchCustomers()}
        initialData={editCustomer}
        groups={groups}
      />

      {/* Delete confirmation dialog */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">Xác nhận xoá</h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600">
                Bạn có chắc muốn xoá khách hàng này? Hành động này không thể hoàn tác.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 font-medium text-sm transition"
              >
                Huỷ
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium text-sm transition disabled:opacity-50"
              >
                {deleting ? "Đang xoá..." : "Xoá"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
