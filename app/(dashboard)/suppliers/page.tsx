"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, Download, Upload, ChevronLeft, ChevronRight, Pencil, Trash2, Eye, X } from "lucide-react";
import { downloadCsv } from "@/lib/shared/csv-export";
import { AddSupplierModal } from "@/invoice-flow-manager-fe/components/suppliers/AddSupplierModal";
import { SupplierProductSearch, type SupplierProductHit } from "@/components/suppliers/SupplierProductSearch";

interface SupplierRow {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  total_purchased: number;
  total_orders: number;
  last_order_at: string | null;
  created_at: string;
  product_count: number;
}

const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

export default function SuppliersPage() {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<SupplierProductHit | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize)
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (productFilter) params.set("productId", productFilter.id);
      const res = await fetch(`/api/suppliers?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tải được.");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi tải danh sách.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, productFilter]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, productFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, total);

  const [notice, setNotice] = useState("");

  function handleSaved(supplier: { id: string; name: string; phone: string; code: string }) {
    const wasEditing = !!editingSupplierId;
    fetchSuppliers();
    setNotice(
      wasEditing
        ? `Đã cập nhật nhà cung cấp "${supplier.name}".`
        : `Đã thêm nhà cung cấp "${supplier.name}" (${supplier.code}).`
    );
    setEditingSupplierId(null);
  }

  function openCreateModal() {
    setEditingSupplierId(null);
    setShowModal(true);
  }

  function openEditModal(id: string) {
    setEditingSupplierId(id);
    setShowModal(true);
  }

  async function handleDelete(row: SupplierRow) {
    if (!confirm(`Xoá nhà cung cấp "${row.name}"? Hành động này không thể hoàn tác.`)) return;
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/suppliers/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Không xoá được nhà cung cấp.");
      setNotice(`Đã xoá nhà cung cấp "${row.name}".`);
      fetchSuppliers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi xoá nhà cung cấp.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      <header className="h-14 bg-white px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
        <h1 className="text-2xl font-semibold text-slate-800">Nhà cung cấp</h1>
        <div className="flex gap-3">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium flex items-center gap-2" onClick={openCreateModal}>
            <Plus className="w-4 h-4" /> Thêm nhà cung cấp
          </button>
          <button className="bg-white border hover:bg-gray-50 text-gray-700 px-4 py-2 rounded shadow-sm text-sm font-medium flex items-center gap-2">
            Trợ giúp
          </button>
        </div>
      </header>

      <div className="bg-white px-6 py-2 border-b flex items-center gap-6 text-sm text-gray-600 flex-shrink-0">
        <button
          onClick={() =>
            downloadCsv(`nha-cung-cap-${Date.now()}.csv`, rows, [
              { label: "Mã nhà cung cấp", value: (r) => r.code },
              { label: "Tên nhà cung cấp", value: (r) => r.name },
              { label: "Nhóm", value: () => "Khác" },
              { label: "Email", value: (r) => r.email },
              { label: "Số điện thoại", value: (r) => r.phone },
              { label: "Trạng thái", value: () => "Đang giao dịch" },
            ])
          }
          className="flex items-center gap-1 hover:text-blue-600"
        >
          <Download className="w-4 h-4" /> Xuất file
        </button>
        <button className="flex items-center gap-1 hover:text-blue-600">
          <Upload className="w-4 h-4" /> Nhập file
        </button>
        <button className="flex items-center gap-1 hover:text-blue-600">
          Nhóm nhà cung cấp
        </button>
        <button className="flex items-center gap-1 hover:text-blue-600">
          Điều chỉnh cột hiển thị
        </button>
      </div>

      {notice ? (
        <div className="mx-6 mt-3 px-4 py-2 rounded border border-emerald-200 bg-emerald-50 text-sm text-emerald-700">
          {notice}
          <button onClick={() => setNotice("")} className="ml-2 underline">Đóng</button>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded shadow-sm flex flex-col">
          <div className="flex border-b">
            <button className="px-6 py-3 text-blue-600 border-b-2 border-blue-600 font-medium text-sm">
              Tất cả nhà cung cấp
            </button>
            <button className="px-6 py-3 text-gray-500 hover:text-gray-700 font-medium text-sm">
              Đang giao dịch
            </button>
          </div>

          <div className="p-4 flex gap-0 border-b">
            <div className="relative">
              <button className="flex items-center gap-2 border rounded-l px-4 py-2 bg-gray-50 text-sm h-10 min-w-[160px] justify-between">
                Lọc nhà cung cấp
                <ChevronLeft className="w-4 h-4 rotate-[-90deg]" />
              </button>
            </div>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2" />
                </svg>
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm theo mã nhà cung cấp, SĐT, tên nhà cung cấp"
                className="w-full h-10 pl-10 pr-4 border-l-0 border-gray-300 rounded-r focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          </div>

          <div className="px-4 pb-4 border-b">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Lọc theo sản phẩm (tìm nhà cung cấp đang cung cấp sản phẩm này)
            </label>
            {productFilter ? (
              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded px-3 py-2 text-sm">
                Đang lọc: <span className="font-medium">{productFilter.name}</span>
                {productFilter.sku ? <span className="text-blue-500">(SKU: {productFilter.sku})</span> : null}
                <button onClick={() => setProductFilter(null)} className="hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <SupplierProductSearch
                placeholder="Tìm theo tên sản phẩm hoặc mã SKU..."
                className="max-w-lg"
                onSelect={(hit) => setProductFilter(hit)}
              />
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-700 font-medium">
                <tr>
                  <th className="p-4 w-10">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" className="rounded text-blue-600" />
                    </div>
                  </th>
                  <th className="p-4 cursor-pointer select-none">
                    Mã nhà cung cấp
                  </th>
                  <th className="p-4 cursor-pointer select-none">
                    Tên nhà cung cấp
                  </th>
                  <th className="p-4">Nhóm</th>
                  <th className="p-4 cursor-pointer select-none">
                    Email
                  </th>
                  <th className="p-4 cursor-pointer select-none">
                    Số điện thoại
                  </th>
                  <th className="p-4 text-right">Số SP cung cấp</th>
                  <th className="p-4">Trạng thái</th>
                  <th className="p-4 w-32 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" /> Đang tải danh sách…
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-red-600">{error}</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-gray-500">
                      {total === 0 && !search && !productFilter
                        ? "Chưa có nhà cung cấp nào. Bấm \"Thêm nhà cung cấp\" để bắt đầu."
                        : "Không tìm thấy nhà cung cấp nào phù hợp."}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-blue-50 transition-colors">
                      <td className="p-4"><input type="checkbox" className="rounded text-blue-600" /></td>
                      <td className="p-4 text-blue-500 font-medium">
                        <Link href={`/suppliers/${row.id}`} className="hover:underline">
                          {row.code || "—"}
                        </Link>
                      </td>
                      <td className="p-4 text-slate-800">
                        <Link href={`/suppliers/${row.id}`} className="hover:underline">
                          {row.name}
                        </Link>
                      </td>
                      <td className="p-4 text-slate-500">Khác</td>
                      <td className="p-4 text-slate-500">{row.email || "—"}</td>
                      <td className="p-4 text-slate-500">{row.phone || "—"}</td>
                      <td className="p-4 text-right tabular-nums text-slate-600">{row.product_count}</td>
                      <td className="p-4">
                        <span className="text-green-600 text-xs font-semibold">
                          Đang giao dịch
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/suppliers/${row.id}`}
                            title="Xem chi tiết"
                            className="p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => openEditModal(row.id)}
                            title="Sửa"
                            className="p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(row)}
                            disabled={deletingId === row.id}
                            title="Xoá"
                            className="p-1.5 rounded text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          >
                            {deletingId === row.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-600 border-t">
            <div>
              Hiển thị kết quả từ {total === 0 ? 0 : startIdx} - {endIdx} trên tổng {total}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                Hiển thị
                <select className="border rounded px-2 py-1 text-sm outline-none">
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
                Kết quả
              </div>
              <div className="flex items-center border rounded overflow-hidden">
                <button
                  disabled={safePage <= 1}
                  onClick={() => setPage(1)}
                  className="px-3 py-1 border-r bg-gray-50 text-gray-400 hover:bg-gray-100 disabled:opacity-50 text-sm"
                >
                  ← Trang đầu
                </button>
                <button
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 border-r bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-sm"
                >
                  ‹
                </button>
                <button className="px-3 py-1 bg-blue-600 text-white font-medium text-sm">
                  {safePage}
                </button>
                <button
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 border-l bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-sm"
                >
                  ›
                </button>
                <button
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="px-3 py-1 border-l bg-gray-50 text-blue-500 hover:bg-gray-100 disabled:opacity-50 text-sm"
                >
                  Trang cuối →
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 mb-4 p-4 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center gap-3 text-sm text-gray-700">
          <span className="w-6 h-6 rounded-full border border-blue-400 text-blue-500 flex items-center justify-center font-bold">?</span>
          Bạn có thể xem thêm hướng dẫn về quản lý nhà cung cấp{" "}
          <a className="text-blue-600 hover:underline" href="#">tại đây</a>
        </div>
      </div>

      {showModal && (
        <AddSupplierModal
          onClose={() => {
            setShowModal(false);
            setEditingSupplierId(null);
          }}
          onSaved={handleSaved}
          supplierId={editingSupplierId}
        />
      )}

      <div className="fixed bottom-10 right-10 z-50">
        <button className="w-12 h-12 bg-blue-500 rounded-full shadow-lg flex items-center justify-center text-white hover:bg-blue-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
