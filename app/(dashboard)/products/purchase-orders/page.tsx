"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Upload, Download, ChevronLeft, ChevronRight, FileText } from "lucide-react";

type PurchaseOrderStatus = "draft" | "pending" | "partial" | "completed" | "cancelled";

interface PurchaseOrderRow {
  id: string;
  code: string;
  supplier_id: string | null;
  supplier_name: string;
  supplier_phone: string;
  branch: string;
  staff: string;
  expected_date: string | null;
  status: PurchaseOrderStatus;
  total_quantity: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
  item_count: number;
}

type TabKey = "all" | "pending" | "partial" | "completed";

const fmtMoney = new Intl.NumberFormat("vi-VN");

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

const STATUS_META: Record<PurchaseOrderStatus, { label: string; className: string }> = {
  draft: { label: "Nháp", className: "bg-slate-100 text-slate-600" },
  pending: { label: "Chưa nhập", className: "bg-slate-100 text-slate-600" },
  partial: { label: "Nhập một phần", className: "bg-orange-100 text-orange-700" },
  completed: { label: "Hoàn thành", className: "bg-green-100 text-green-700" },
  cancelled: { label: "Đã hủy", className: "bg-red-100 text-red-700" }
};

function isVisibleToTab(status: PurchaseOrderStatus, tab: TabKey): boolean {
  if (tab === "all") return status !== "draft";
  if (tab === "pending") return status === "pending";
  if (tab === "partial") return status === "partial";
  if (tab === "completed") return status === "completed";
  return true;
}

export default function PurchaseOrdersListPage() {
  const [rows, setRows] = useState<PurchaseOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/purchase-orders")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setRows(data);
        } else {
          setError(typeof data?.error === "string" ? data.error : "Không tải được danh sách.");
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi mạng."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!isVisibleToTab(row.status, tab)) return false;
      if (!q) return true;
      return (
        row.code.toLowerCase().includes(q) ||
        (row.supplier_name ?? "").toLowerCase().includes(q) ||
        (row.staff ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, tab, search]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { all: 0, pending: 0, partial: 0, completed: 0 };
    for (const row of rows) {
      if (row.status === "draft") continue;
      c.all += 1;
      if (row.status === "pending") c.pending += 1;
      if (row.status === "partial") c.partial += 1;
      if (row.status === "completed") c.completed += 1;
    }
    return c;
  }, [rows]);

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
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      <header className="h-14 bg-white border-b flex items-center justify-between px-6 flex-shrink-0">
        <h1 className="text-lg font-semibold text-slate-800">Danh sách đơn đặt hàng nhập</h1>
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <button className="flex items-center gap-1 hover:text-blue-600">
            <FileText className="w-4 h-4" /> Tư vấn thuế
          </button>
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
          <button className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600">
            <Download className="w-4 h-4" /> Xuất file
          </button>
          <button className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600">
            <Upload className="w-4 h-4" /> Nhập file
          </button>
        </div>
        <Link
          href="/products/purchase-orders/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Tạo đơn đặt hàng
        </Link>
      </div>

      <div className="bg-white px-4 pt-2 border-b flex-shrink-0">
        <div className="flex border-b text-sm">
          {tabButton("all", "Tất cả đơn đặt hàng")}
          {tabButton("pending", "Chưa nhập")}
          {tabButton("partial", "Nhập một phần")}
          {tabButton("completed", "Hoàn thành")}
        </div>
        <div className="py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-2xl">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2" />
              </svg>
            </span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm mã đơn nhập, đơn đặt hàng, tên, SĐT, mã NCC"
              className="pl-10 block w-full border-slate-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select className="border-slate-300 rounded-md text-sm py-2 px-3">
            <option>Trạng thái</option>
          </select>
          <select className="border-slate-300 rounded-md text-sm py-2 px-3">
            <option>Ngày tạo</option>
          </select>
          <select className="border-slate-300 rounded-md text-sm py-2 px-3">
            <option>Sản phẩm</option>
          </select>
          <button className="flex items-center gap-1 border border-slate-300 rounded-md text-sm py-2 px-3 hover:bg-slate-50">
            Bộ lọc khác
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" strokeWidth="2" />
            </svg>
          </button>
          <button className="text-slate-400 text-sm py-2 px-3 cursor-not-allowed">Lưu bộ lọc</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-500 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" /> Đang tải danh sách…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20 text-sm text-red-600">{error}</div>
        ) : (
          <table className="min-w-full text-sm text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b">
              <tr>
                <th className="p-3 w-10">
                  <input type="checkbox" className="rounded border-slate-300 text-blue-600" />
                </th>
                <th className="p-3 text-slate-600 font-semibold w-8"></th>
                <th className="p-3 text-slate-600 font-semibold">Mã đơn</th>
                <th className="p-3 text-slate-600 font-semibold">Ngày tạo ▼</th>
                <th className="p-3 text-slate-600 font-semibold text-center">Trạng thái</th>
                <th className="p-3 text-slate-600 font-semibold">Chi nhánh tạo</th>
                <th className="p-3 text-slate-600 font-semibold">Nhà cung cấp</th>
                <th className="p-3 text-slate-600 font-semibold">Nhân viên tạo</th>
                <th className="p-3 text-slate-600 font-semibold text-right">SL đặt</th>
                <th className="p-3 text-slate-600 font-semibold text-right">Giá trị đơn</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-500">
                    {rows.length === 0
                      ? "Chưa có đơn đặt hàng nào. Bấm \"Tạo đơn đặt hàng\" để bắt đầu."
                      : "Không có đơn nào khớp bộ lọc hiện tại."}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const meta = STATUS_META[row.status] ?? STATUS_META.pending;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <input type="checkbox" className="rounded border-slate-300" />
                      </td>
                      <td className="p-3 text-slate-400">»</td>
                      <td className="p-3">
                        <Link
                          href={`/products/purchase-orders/${row.id}`}
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
                      <td className="p-3">{row.supplier_name || "—"}</td>
                      <td className="p-3">{row.staff || "—"}</td>
                      <td className="p-3 text-right tabular-nums">
                        {row.total_quantity.toLocaleString("vi-VN")}
                      </td>
                      <td className="p-3 text-right tabular-nums font-medium">
                        {fmtMoney.format(row.total_amount)}
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
  );
}
