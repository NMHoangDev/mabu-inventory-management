"use client";

import { useCallback, useEffect, useState } from "react";
import { downloadCsv } from "@/lib/shared/csv-export";
import { formatCurrencyVND } from "@/lib/shared/format";
import {
  Calendar,
  ChevronDown,
  Download,
  HelpCircle,
  Loader2,
  MessageCircle,
  Search,
  TrendingDown,
  TrendingUp
} from "lucide-react";

type VoucherType = "receipt" | "payment" | "";
type VoucherStatus = "draft" | "completed" | "cancelled";

interface LedgerRow {
  id: string;
  code: string;
  voucher_type: VoucherType;
  group_name: string;
  person_name: string;
  reference_code: string;
  payment_method: string;
  amount: number;
  status: VoucherStatus;
  created_by: string;
  created_at: string;
  recorded_date: string;
  note: string;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

type ActiveTab = "all" | "payment" | "receipt";

interface PaymentMethodBalance {
  method: string;
  total_receipts: number;
  total_payments: number;
  balance: number;
}

export default function CashLedgerPage() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [methodBalances, setMethodBalances] = useState<PaymentMethodBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [dateFrom, setDateFrom] = useState("2026-05-20");
  const [dateTo, setDateTo] = useState("2026-06-19");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (activeTab === "receipt") params.set("voucher_type", "receipt");
      if (activeTab === "payment") params.set("voucher_type", "payment");
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
  }, [page, pageSize, debouncedSearch, activeTab]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { setPage(1); }, [debouncedSearch, activeTab]);

  useEffect(() => {
    fetch("/api/cash-book/balance-by-method")
      .then((res) => res.json())
      .then((data) => setMethodBalances(data?.balances ?? []))
      .catch(() => setMethodBalances([]));
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, total);

  const totalReceipts = rows
    .filter((r) => r.voucher_type === "receipt")
    .reduce((s, r) => s + r.amount, 0);
  const totalPayments = rows
    .filter((r) => r.voucher_type === "payment")
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      {/* Top Navbar */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-800">Sổ quỹ</h1>
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <button className="flex items-center gap-1.5 hover:text-blue-600">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Trợ giúp
          </button>
          <div className="flex items-center gap-2 border-l pl-4">
            <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">N</div>
            <span className="font-medium">NA</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>
        </div>
      </header>

      {/* Sub Header / Filter Bar */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Date type selector */}
          <div className="relative">
            <select className="appearance-none border border-gray-300 rounded px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white cursor-pointer">
              <option>Ngày ghi nhận</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-gray-400 pointer-events-none" />
          </div>
          {/* Date range */}
          <div className="relative flex items-center gap-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            />
            <span className="text-gray-400 text-xs">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() =>
              downloadCsv(`so-quy-${Date.now()}.csv`, rows, [
                { label: "Ngày ghi nhận", value: (r) => (r.recorded_date ? formatDate(r.recorded_date) : "") },
                { label: "Ngày tạo", value: (r) => formatDateTime(r.created_at) },
                { label: "Mã phiếu", value: (r) => r.code },
                { label: "Loại", value: (r) => (r.voucher_type === "receipt" ? "Thu" : "Chi") },
                { label: "Người tạo", value: (r) => r.created_by },
                { label: "HTTT", value: (r) => r.payment_method },
                { label: "Thu", value: (r) => (r.voucher_type === "receipt" ? r.amount : "") },
                { label: "Chi", value: (r) => (r.voucher_type === "payment" ? r.amount : "") },
                { label: "Ghi chú", value: (r) => r.note },
              ])
            }
            className="flex items-center text-gray-600 text-sm hover:text-blue-600"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Xuất file
          </button>
          <button className="flex items-center text-gray-600 text-sm hover:text-blue-600">
            <HelpCircle className="w-4 h-4 mr-1.5" />
            Giải thích thuật ngữ
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="bg-gray-50 px-4 py-6 border-b border-gray-200 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            <div className="text-xs text-gray-500 mb-1">Số dư đầu kỳ</div>
            <div className="text-lg font-bold text-gray-800">
              {formatCurrencyVND(-49785480)}
            </div>
          </div>
          <div className="text-gray-400 font-bold text-xl">+</div>
          <div className="flex-1 text-center">
            <div className="text-xs text-gray-500 mb-1">Tổng thu</div>
            <div className="text-lg font-bold text-green-600 flex items-center justify-center gap-1">
              <TrendingUp className="w-4 h-4" />
              {formatCurrencyVND(totalReceipts)}
            </div>
          </div>
          <div className="text-gray-400 font-bold text-xl">-</div>
          <div className="flex-1 text-center">
            <div className="text-xs text-gray-500 mb-1">Tổng chi</div>
            <div className="text-lg font-bold text-red-500 flex items-center justify-center gap-1">
              <TrendingDown className="w-4 h-4" />
              {formatCurrencyVND(totalPayments)}
            </div>
          </div>
          <div className="text-gray-400 font-bold text-xl">=</div>
          <div className="flex-1 text-center">
            <div className="text-xs text-gray-500 mb-1">Tồn cuối kỳ</div>
            <div className="text-lg font-bold text-blue-500">
              {formatCurrencyVND(-49785480 + totalReceipts - totalPayments)}
            </div>
          </div>
        </div>
        {methodBalances.length > 0 && (
          <div className="max-w-6xl mx-auto mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs text-gray-500 mb-2 text-center">Số dư theo hình thức thanh toán</div>
            <div className="flex items-center justify-center gap-4">
              {methodBalances.map((mb) => (
                <div key={mb.method} className="flex-1 max-w-[220px] text-center bg-white rounded-lg border border-gray-200 py-3 px-2">
                  <div className="text-xs text-gray-500 mb-1">{mb.method}</div>
                  <div className={`text-lg font-bold ${mb.balance < 0 ? "text-red-500" : "text-gray-800"}`}>
                    {formatCurrencyVND(mb.balance)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="flex px-4 border-b border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-6 py-3 text-sm cursor-pointer border-b-2 transition-colors ${
              activeTab === "all"
                ? "border-blue-500 text-blue-500 font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setActiveTab("payment")}
            className={`px-6 py-3 text-sm cursor-pointer border-b-2 transition-colors ${
              activeTab === "payment"
                ? "border-blue-500 text-blue-500 font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Phiếu chi
          </button>
          <button
            onClick={() => setActiveTab("receipt")}
            className={`px-6 py-3 text-sm cursor-pointer border-b-2 transition-colors ${
              activeTab === "receipt"
                ? "border-blue-500 text-blue-500 font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Phiếu thu
          </button>
        </div>

        {/* Search & Filters */}
        <div className="p-4 flex items-center gap-3 bg-white border-b flex-shrink-0">
          <div className="relative flex-1 max-w-2xl">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm theo Mã phiếu, Mã chứng từ gốc, Tag"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select className="appearance-none border border-gray-300 rounded px-3 py-2 pr-8 text-sm text-gray-600 bg-white min-w-[120px] focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option>Người tạo</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select className="appearance-none border border-gray-300 rounded px-3 py-2 pr-8 text-sm text-gray-600 bg-white min-w-[120px] focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option>Chi nhánh</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select className="appearance-none border border-gray-300 rounded px-3 py-2 pr-8 text-sm text-gray-600 bg-white min-w-[160px] focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option>Hình thức thanh toán</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-white">
          <div className="min-w-[1000px]">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-y border-gray-200 sticky top-0 z-10">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Ngày ghi nhận</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                  <th className="px-4 py-3">Mã phiếu</th>
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3">Người tạo</th>
                  <th className="px-4 py-3">HTTT</th>
                  <th className="px-4 py-3 text-right text-green-600">Thu</th>
                  <th className="px-4 py-3 text-right text-red-600">Chi</th>
                  <th className="px-4 py-3">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" /> Đang tải…
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-red-600">{error}</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="flex flex-col items-center justify-center py-16">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                          <Search className="w-10 h-10 text-gray-200" />
                        </div>
                        <p className="text-gray-700 font-medium mb-1">Không tìm thấy dữ liệu phù hợp với kết quả tìm kiếm</p>
                        <p className="text-gray-400 text-sm">Thử thay đổi điều kiện lọc hoặc từ khóa tìm kiếm</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500">
                        {row.recorded_date ? formatDate(row.recorded_date) : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDateTime(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`/finance/${row.voucher_type === "receipt" ? "receipt" : "payment"}-vouchers/${row.id}`}
                          className="text-blue-600 font-medium hover:underline"
                        >
                          {row.code}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          row.voucher_type === "receipt"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {row.voucher_type === "receipt" ? "Thu" : "Chi"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{row.created_by || "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{row.payment_method || "—"}</td>
                      <td className="px-4 py-3 text-right text-green-600 font-medium tabular-nums">
                        {row.voucher_type === "receipt" ? formatCurrencyVND(row.amount) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600 font-medium tabular-nums">
                        {row.voucher_type === "payment" ? formatCurrencyVND(row.amount) : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{row.note || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {rows.length > 0 && (
          <div className="h-14 border-t bg-white px-4 flex items-center justify-between flex-shrink-0">
            <div className="text-sm text-gray-500">
              Từ {startIdx} đến {endIdx} trên tổng số {total}
            </div>
            <div className="flex items-center gap-1">
              <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 disabled:opacity-30"
                disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
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
              <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 disabled:opacity-30"
                disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Help Banner */}
        <div className="p-6 border-t border-gray-100 flex justify-center flex-shrink-0">
          <div className="bg-cyan-50 border border-cyan-100 rounded-full px-6 py-2.5 flex items-center gap-3 text-sm">
            <div className="w-8 h-8 bg-cyan-400 rounded-full flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-gray-600">
              Bạn có thể xem thêm hướng dẫn về sổ quỹ{" "}
              <a className="text-blue-500 hover:underline" href="#">Tại đây</a>
            </span>
          </div>
        </div>
      </div>

      {/* Floating chat button */}
      <div className="fixed bottom-6 right-6">
        <button className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-colors">
          <MessageCircle className="text-white w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
