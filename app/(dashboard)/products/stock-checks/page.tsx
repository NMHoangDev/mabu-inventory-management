"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { downloadCsv } from "@/lib/shared/csv-export";
import {
  Loader2,
  Plus,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  FileText
} from "lucide-react";
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { PageGuard } from "@/components/auth/PageGuard";

type StockCheckStatus = "draft" | "in_progress" | "balanced" | "cancelled";

interface StockCheckRow {
  id: string;
  code: string;
  branch: string;
  staff: string;
  status: StockCheckStatus;
  total_items: number;
  matched_items: number;
  variance_items: number;
  created_at: string;
  updated_at: string;
}

type TabKey = "all" | "draft" | "in_progress" | "balanced";

const STATUS_META: Record<StockCheckStatus, { label: string; className: string }> = {
  draft: { label: "Nháp", className: "bg-slate-100 text-slate-600" },
  in_progress: { label: "Đang kiểm", className: "bg-blue-100 text-blue-700" },
  balanced: { label: "Đã cân bằng", className: "bg-green-100 text-green-700" },
  cancelled: { label: "Đã hủy", className: "bg-red-100 text-red-700" }
};

function isVisibleToTab(status: StockCheckStatus, tab: TabKey): boolean {
  if (tab === "all") return true;
  return status === tab;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

export default function StockChecksListPage() {
  const { hasPermission } = usePermissions();
  const [rows, setRows] = useState<StockCheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stock-checks")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) setRows(data);
        else setError(typeof data?.error === "string" ? data.error : "Không tải được danh sách.");
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi mạng."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { all: 0, draft: 0, in_progress: 0, balanced: 0 };
    for (const row of rows) {
      c.all += 1;
      if (row.status === "draft") c.draft += 1;
      if (row.status === "in_progress") c.in_progress += 1;
      if (row.status === "balanced") c.balanced += 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!isVisibleToTab(row.status, tab)) return false;
      if (!q) return true;
      return (
        row.code.toLowerCase().includes(q) ||
        (row.staff ?? "").toLowerCase().includes(q) ||
        (row.branch ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, tab, search]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageRows = filtered.slice(startIdx, endIdx);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const tabButton = (key: TabKey, label: string) => {
    const active = tab === key;
    return (
      <button
        type="button"
        key={key}
        onClick={() => {
          setTab(key);
          setPage(1);
        }}
        className={`px-4 py-2 text-sm transition-colors ${
          active
            ? "border-b-2 border-blue-600 text-blue-600 font-medium"
            : "text-slate-500 hover:text-blue-600"
        }`}
      >
        {label} ({counts[key]})
      </button>
    );
  };

  return (
    <PageGuard permission="stock_checks.view">
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      <header className="h-14 bg-white border-b flex items-center justify-between px-6 flex-shrink-0">
        <h1 className="text-lg font-semibold text-slate-800">Danh sách phiếu kiểm hàng</h1>
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <button className="flex items-center gap-1 hover:text-blue-600">
            <FileText className="w-4 h-4" /> Trợ giúp
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
              NA
            </div>
            <span>NA</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </header>

      <div className="p-4 bg-white border-b flex items-center justify-between flex-shrink-0">
        <div className="flex gap-4">
          <button
            onClick={() =>
              downloadCsv(`kiem-hang-${Date.now()}.csv`, filtered, [
                { label: "Mã phiếu", value: (r) => r.code },
                { label: "Ngày tạo", value: (r) => formatDateTime(r.created_at) },
                { label: "Trạng thái", value: (r) => STATUS_META[r.status]?.label ?? r.status },
                { label: "Chi nhánh", value: (r) => r.branch || "Chi nhánh mặc định" },
                { label: "Nhân viên kiểm", value: (r) => r.staff },
                { label: "Tổng SP", value: (r) => r.total_items },
                { label: "Khớp", value: (r) => r.matched_items },
                { label: "Lệch", value: (r) => r.variance_items },
              ])
            }
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600"
          >
            <Download className="w-4 h-4" /> Xuất file
          </button>
          <button className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600">
            <Upload className="w-4 h-4" /> Nhập file
          </button>
        </div>
        {hasPermission("stock_checks.create") ? (
          <Link
            href="/products/stock-checks/new"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Tạo phiếu kiểm hàng
          </Link>
        ) : null}
      </div>

      <div className="bg-white px-4 pt-2 border-b flex-shrink-0">
        <div className="flex border-b text-sm">
          {tabButton("all", "Tất cả")}
          {tabButton("draft", "Nháp")}
          {tabButton("in_progress", "Đang kiểm")}
          {tabButton("balanced", "Đã cân bằng")}
        </div>
        <div className="py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-2xl">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  strokeWidth="2"
                />
              </svg>
            </span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm mã phiếu, nhân viên kiểm, chi nhánh"
              className="pl-10 block w-full border-slate-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select className="border-slate-300 rounded-md text-sm py-2 px-3">
            <option>Trạng thái</option>
          </select>
          <select className="border-slate-300 rounded-md text-sm py-2 px-3">
            <option>Ngày tạo</option>
          </select>
          <button className="text-slate-400 text-sm py-2 px-3 cursor-not-allowed">Lưu bộ lọc</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-500 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" /> Đang tải danh sách…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20 text-sm text-red-600">
            {error}
          </div>
        ) : (
          <table className="min-w-full text-sm text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b">
              <tr>
                <th className="p-3 w-10">
                  <input type="checkbox" className="rounded border-slate-300 text-blue-600" />
                </th>
                <th className="p-3 text-slate-600 font-semibold w-8"></th>
                <th className="p-3 text-slate-600 font-semibold">Mã phiếu</th>
                <th className="p-3 text-slate-600 font-semibold">Ngày tạo ▼</th>
                <th className="p-3 text-slate-600 font-semibold text-center">Trạng thái</th>
                <th className="p-3 text-slate-600 font-semibold">Chi nhánh</th>
                <th className="p-3 text-slate-600 font-semibold">Nhân viên kiểm</th>
                <th className="p-3 text-slate-600 font-semibold text-right">Tổng SP</th>
                <th className="p-3 text-slate-600 font-semibold text-right">Khớp</th>
                <th className="p-3 text-slate-600 font-semibold text-right">Lệch</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-500">
                    {rows.length === 0
                      ? "Chưa có phiếu kiểm hàng nào. Bấm \"Tạo phiếu kiểm hàng\" để bắt đầu."
                      : "Không có phiếu nào khớp bộ lọc hiện tại."}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const meta = STATUS_META[row.status] ?? STATUS_META.draft;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <input type="checkbox" className="rounded border-slate-300" />
                      </td>
                      <td className="p-3 text-slate-400">»</td>
                      <td className="p-3">
                        <Link
                          href={`/products/stock-checks/${row.id}`}
                          className="text-blue-600 font-medium hover:underline"
                        >
                          {row.code}
                        </Link>
                      </td>
                      <td className="p-3">{formatDateTime(row.created_at)}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-block px-2 py-1 rounded-full text-xs ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="p-3">{row.branch || "Chi nhánh mặc định"}</td>
                      <td className="p-3">{row.staff || "—"}</td>
                      <td className="p-3 text-right tabular-nums">{row.total_items}</td>
                      <td className="p-3 text-right tabular-nums text-green-600">
                        {row.matched_items}
                      </td>
                      <td className="p-3 text-right tabular-nums text-orange-600">
                        {row.variance_items}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      <footer className="h-12 bg-white border-t flex items-center justify-between px-4 text-xs text-slate-600 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span>Hiển thị</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="border-slate-300 rounded text-xs py-1 px-2"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>kết quả</span>
          <span className="ml-3 text-slate-500">
            Từ {total === 0 ? 0 : startIdx + 1} đến {endIdx} trên tổng {total}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-slate-700">
            Trang {safePage} / {totalPages}
          </span>
          <button
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
    </PageGuard>
  );
}
