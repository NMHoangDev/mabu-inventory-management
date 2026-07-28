"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { downloadCsv } from "@/lib/shared/csv-export";
import { formatCurrencyVND } from "@/lib/shared/format";
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { PageGuard } from "@/components/auth/PageGuard";
import {
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Loader2,
  Plus,
  Upload
} from "lucide-react";

type VoucherStatus = "draft" | "completed" | "cancelled";

interface ReceiptRow {
  id: string;
  code: string;
  voucher_type: string;
  payment_category: string;
  group_name: string;
  person_name: string;
  reference_code: string;
  amount: number;
  status: VoucherStatus;
  created_at: string;
}

const STATUS_META: Record<VoucherStatus, { label: string; className: string }> = {
  draft: { label: "Nháp", className: "bg-slate-100 text-slate-600" },
  completed: { label: "Hoàn thành", className: "bg-green-50 text-green-600 border border-green-200" },
  cancelled: { label: "Đã hủy", className: "bg-red-50 text-red-600" }
};

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

export default function ReceiptVouchersPage() {
  const { hasPermission } = usePermissions();
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<VoucherStatus | undefined>(undefined);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ voucher_type: "receipt", page: String(page), pageSize: String(pageSize) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/cash-book?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tải được.");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi tải.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, total);

  return (
    <PageGuard permission="receipt_vouchers.view">
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      <header className="h-14 bg-white border-b px-4 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-medium text-slate-800">Phiếu thu</h1>
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <button className="flex items-center gap-1.5 hover:text-blue-600">
            <HelpCircle className="w-4 h-4" /> Trợ giúp
          </button>
          <div className="flex items-center gap-2 border-l pl-4">
            <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">N</div>
            <span className="font-medium text-slate-800">NA</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </header>

      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <button
            onClick={() =>
              downloadCsv(`phieu-thu-${Date.now()}.csv`, rows, [
                { label: "Ngày tạo", value: (r) => formatDateTime(r.created_at) },
                { label: "Mã phiếu", value: (r) => r.code },
                { label: "Loại phiếu", value: (r) => r.payment_category || "Tự động" },
                { label: "Trạng thái", value: (r) => STATUS_META[r.status]?.label ?? r.status },
                { label: "Số tiền thu", value: (r) => r.amount },
                { label: "Nhóm người nộp", value: (r) => r.group_name },
                { label: "Chứng từ gốc", value: (r) => r.reference_code },
                { label: "Tên người nộp", value: (r) => r.person_name },
              ])
            }
            className="flex items-center gap-2 hover:text-blue-600"
          >
            <Upload className="w-4 h-4" /> Xuất file
          </button>
        </div>
        {hasPermission("receipt_vouchers.create") ? (
          <Link
            href="/finance/receipt-vouchers/new"
            className="bg-[#0088ff] hover:bg-[#0077ee] text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Tạo phiếu thu
          </Link>
        ) : null}
      </div>

      <div className="border-b px-4 pt-2 flex-shrink-0">
        <nav className="flex space-x-8">
          <button
            onClick={() => setStatusFilter(undefined)}
            className={`border-b-2 py-2 text-sm font-medium transition-colors ${
              statusFilter === undefined
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Tất cả phiếu thu
          </button>
          <button
            onClick={() => setStatusFilter("completed")}
            className={`border-b-2 py-2 text-sm font-medium transition-colors ${
              statusFilter === "completed"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Phiếu thu hoàn thành
          </button>
          <button
            onClick={() => setStatusFilter("cancelled")}
            className={`border-b-2 py-2 text-sm font-medium transition-colors ${
              statusFilter === "cancelled"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Phiếu thu đã hủy
          </button>
        </nav>
      </div>

      <div className="p-4 flex items-center gap-2 bg-white border-b flex-shrink-0">
        <div className="relative flex-1 max-w-xl">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2" />
            </svg>
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm theo mã phiếu thu, tham chiếu, mã chứng từ gốc"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <button className="px-4 py-2 border border-gray-300 rounded-md text-sm text-slate-700 bg-white hover:bg-gray-50 flex items-center">
          Ngày tạo <svg className="ml-2 w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <button className="px-4 py-2 border border-gray-300 rounded-md text-sm text-slate-700 bg-white hover:bg-gray-50 flex items-center">
          Nhóm người nộp <svg className="ml-2 w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <button className="px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-300 bg-white cursor-not-allowed">
          Lưu bộ lọc
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <div className="min-w-[900px]">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <th className="px-4 py-3 border-b w-8">
                  <i className="fas fa-cog text-gray-400"></i>
                </th>
                <th className="px-4 py-3 border-b w-8">
                  <input type="checkbox" className="rounded border-gray-300 text-blue-600" />
                </th>
                <th className="px-4 py-3 border-b">Ngày tạo <i className="fas fa-sort text-gray-400 ml-1"></i></th>
                <th className="px-4 py-3 border-b">Mã phiếu</th>
                <th className="px-4 py-3 border-b text-center">Loại phiếu</th>
                <th className="px-4 py-3 border-b text-center">Trạng thái</th>
                <th className="px-4 py-3 border-b text-right">Số tiền thu</th>
                <th className="px-4 py-3 border-b">Nhóm người nộp</th>
                <th className="px-4 py-3 border-b">Chứng từ gốc</th>
                <th className="px-4 py-3 border-b">Tên người nộp</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" /> Đang tải…
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-red-600">{error}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-500">
                    {total === 0 && !search
                      ? "Chưa có phiếu thu nào. Bấm \"Tạo phiếu thu\" để bắt đầu."
                      : "Không tìm thấy phiếu thu nào phù hợp."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const meta = STATUS_META[row.status] ?? STATUS_META.draft;
                  return (
                    <tr key={row.id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3"><input type="checkbox" className="rounded border-gray-300 text-blue-600" /></td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/finance/receipt-vouchers/${row.id}`} className="text-blue-600 font-medium hover:underline">
                          {row.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-500">{row.payment_category || "Tự động"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${meta.className}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrencyVND(row.amount)}</td>
                      <td className="px-4 py-3 text-slate-500">{row.group_name || "—"}</td>
                      <td className="px-4 py-3">
                        {row.reference_code ? (
                          <Link href={`/orders/${row.reference_code}`} className="text-blue-600 hover:underline">
                            {row.reference_code}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {row.person_name ? (
                          <Link href={`/customers/${row.person_name}`} className="text-blue-600 hover:underline">
                            {row.person_name}
                          </Link>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="h-14 border-t bg-white px-4 flex items-center justify-between shrink-0">
        <div className="text-sm text-gray-500">
          Hiển thị
          <select className="mx-2 py-1 border-gray-300 rounded text-xs focus:ring-blue-500">
            <option>20</option><option>50</option><option>100</option>
          </select>
          kết quả Từ {startIdx} đến {endIdx} trên tổng số {total}
        </div>
        <div className="flex items-center space-x-1">
          <button disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = Math.max(1, Math.min(totalPages - 4, safePage - 2)) + i;
            return (
              <button key={p} onClick={() => setPage(p)}
                className={`w-8 h-8 flex items-center justify-center rounded text-xs font-medium ${p === safePage ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                {p}
              </button>
            );
          })}
          <button disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>

      <div className="px-4 py-4 bg-gray-50 border-t flex justify-center">
        <div className="bg-white border rounded-lg px-6 py-4 flex items-center shadow-sm">
          <svg className="w-5 h-5 text-blue-500 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-slate-600">
            Bạn có thể xem thêm hướng dẫn về phiếu thu{" "}
            <a className="text-blue-500 hover:underline" href="#">Tại đây</a>
          </span>
        </div>
      </div>
    </div>
    </PageGuard>
  );
}
