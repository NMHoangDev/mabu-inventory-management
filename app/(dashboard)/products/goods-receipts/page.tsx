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
  FileText,
  Settings
} from "lucide-react";

type ReceiptStatus = "pending" | "in_progress" | "completed" | "cancelled";
type PaymentStatus = "unpaid" | "partial" | "paid";

interface GoodsReceiptRow {
  id: string;
  code: string;
  supplier_id: string | null;
  supplier_name: string;
  branch: string;
  staff: string;
  received_at: string;
  receipt_status: ReceiptStatus;
  payment_status: PaymentStatus;
  total_cost: number;
  total_quantity: number;
  paid: number;
  created_at: string;
}

type TabKey = "all" | "in_progress" | "completed";

// "Trạng thái" = trạng thái NHẬP HÀNG (hàng đã về kho / tồn kho đã cộng chưa)
// — hoàn toàn tách biệt khỏi thanh toán cho NCC (xem PAYMENT_META).
const RECEIPT_META: Record<ReceiptStatus, { label: string; className: string }> = {
  pending: { label: "Chưa nhập", className: "bg-slate-100 text-slate-600" },
  in_progress: { label: "Đang giao dịch", className: "bg-orange-100 text-orange-700" },
  completed: { label: "Đã nhập hàng", className: "bg-green-100 text-green-700" },
  cancelled: { label: "Đã hủy", className: "bg-red-100 text-red-700" }
};

// "Trạng thái thanh toán" — TÁCH RIÊNG khỏi trạng thái nhập hàng ở trên.
const PAYMENT_META: Record<PaymentStatus, { label: string; className: string }> = {
  unpaid: { label: "Chưa thanh toán", className: "bg-slate-100 text-slate-600" },
  partial: { label: "Thanh toán 1 phần", className: "bg-amber-100 text-amber-700" },
  paid: { label: "Đã thanh toán", className: "bg-emerald-100 text-emerald-700" }
};

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export default function GoodsReceiptsListPage() {
  const [rows, setRows] = useState<GoodsReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/goods-receipts")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) setRows(data);
        else setError(typeof (data as any)?.error === "string" ? (data as any).error : "Không tải được.");
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Lỗi mạng."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { all: 0, in_progress: 0, completed: 0 };
    for (const row of rows) {
      c.all += 1;
      if (row.receipt_status === "in_progress") c.in_progress += 1;
      if (row.receipt_status === "completed") c.completed += 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab === "in_progress" && row.receipt_status !== "in_progress") return false;
      if (tab === "completed" && row.receipt_status !== "completed") return false;
      if (!q) return true;
      return (
        row.code.toLowerCase().includes(q) ||
        (row.supplier_name ?? "").toLowerCase().includes(q) ||
        (row.staff ?? "").toLowerCase().includes(q)
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

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      <header className="h-14 bg-white border-b flex items-center justify-between px-6 flex-shrink-0">
        <h1 className="text-lg font-semibold text-slate-800">Danh sách đơn nhập hàng</h1>
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <button className="flex items-center gap-1 hover:text-blue-600">
            <FileText className="w-4 h-4" /> Trợ giúp
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">N</div>
            <span>NA</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </header>

      <div className="p-4 bg-white border-b flex items-center justify-between flex-shrink-0">
        <div className="flex gap-4">
          <button
            onClick={() =>
              downloadCsv(`don-nhap-hang-${Date.now()}.csv`, filtered, [
                { label: "Mã đơn nhập", value: (r) => r.code },
                { label: "Ngày nhập", value: (r) => formatDateTime(r.received_at || r.created_at) },
                { label: "Trạng thái nhập", value: (r) => RECEIPT_META[r.receipt_status]?.label ?? r.receipt_status },
                { label: "Trạng thái thanh toán", value: (r) => PAYMENT_META[r.payment_status]?.label ?? r.payment_status },
                { label: "Chi nhánh nhập", value: (r) => r.branch || "Chi nhánh mặc định" },
                { label: "Nhà cung cấp", value: (r) => r.supplier_name },
                { label: "Nhân viên tạo", value: (r) => r.staff },
                { label: "Giá trị đơn", value: (r) => r.total_cost },
              ])
            }
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600"
          >
            <Download className="w-4 h-4" /> Xuất file
          </button>
          <button className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600">
            <Upload className="w-4 h-4" /> Nhập file
          </button>
          <button className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600">
            <Settings className="w-4 h-4" /> Quản lý hàng NCC
          </button>
        </div>
        <Link
          href="/products/goods-receipts/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Tạo đơn nhập hàng
        </Link>
      </div>

      <div className="bg-white px-4 pt-2 border-b flex-shrink-0">
        <div className="flex border-b text-sm">
          {(
            [
              ["all", "Tất cả đơn nhập hàng"],
              ["in_progress", "Đang giao dịch"],
              ["completed", "Hoàn thành"]
            ] as [TabKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setPage(1); }}
              className={`px-4 py-2 text-sm transition-colors ${tab === key ? "border-b-2 border-blue-600 text-blue-600 font-medium" : "text-slate-500 hover:text-blue-600"}`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
        <div className="py-3 flex items-center gap-2">
          <div className="relative flex-1 max-w-2xl">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2" />
              </svg>
            </span>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Tìm mã đơn nhập, tên, SĐT, mã NCC"
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
          <button className="text-slate-400 text-sm py-2 px-3 cursor-not-allowed">Lưu bộ lọc</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-500 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" /> Đang tải…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20 text-sm text-red-600">{error}</div>
        ) : (
          <table className="w-full text-left text-sm min-w-[1000px]">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b">
              <tr>
                <th className="p-3 w-10"><input type="checkbox" className="rounded border-slate-300" /></th>
                <th className="p-3 w-8"></th>
                <th className="p-3 text-slate-600 font-semibold">Mã đơn nhập</th>
                <th className="p-3 text-slate-600 font-semibold">Ngày nhập ▼</th>
                <th className="p-3 text-slate-600 font-semibold text-center">Trạng thái nhập</th>
                <th className="p-3 text-slate-600 font-semibold text-center">Trạng thái thanh toán</th>
                <th className="p-3 text-slate-600 font-semibold">Chi nhánh nhập</th>
                <th className="p-3 text-slate-600 font-semibold">Nhà cung cấp</th>
                <th className="p-3 text-slate-600 font-semibold">Nhân viên tạo</th>
                <th className="p-3 text-slate-600 font-semibold text-right">Giá trị đơn</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-500">
                    {rows.length === 0
                      ? "Chưa có đơn nhập hàng nào. Bấm \"Tạo đơn nhập hàng\" để bắt đầu."
                      : "Không có đơn nào khớp bộ lọc hiện tại."}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const rMeta = RECEIPT_META[row.receipt_status] ?? RECEIPT_META.pending;
                  const pMeta = PAYMENT_META[row.payment_status] ?? PAYMENT_META.unpaid;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3"><input type="checkbox" className="rounded border-slate-300" /></td>
                      <td className="p-3 text-slate-400">»</td>
                      <td className="p-3">
                        <Link href={`/products/goods-receipts/${row.id}`} className="text-blue-600 font-medium hover:underline">
                          {row.code}
                        </Link>
                      </td>
                      <td className="p-3 text-slate-500">{formatDateTime(row.received_at || row.created_at)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${rMeta.className}`}>
                          {rMeta.label}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${pMeta.className}`}>
                          {pMeta.label}
                        </span>
                      </td>
                      <td className="p-3">{row.branch || "Chi nhánh mặc định"}</td>
                      <td className="p-3">{row.supplier_name || "—"}</td>
                      <td className="p-3">{row.staff || "—"}</td>
                      <td className="p-3 text-right font-medium tabular-nums">{fmtMoney.format(row.total_cost)}</td>
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
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="border-slate-300 rounded text-xs py-1 px-2"
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <span>kết quả</span>
          <span className="ml-3">
            Từ {total === 0 ? 0 : startIdx + 1} đến {endIdx} trên tổng {total}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="w-8 h-8 flex items-center justify-center rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3">Trang {safePage} / {totalPages}</span>
          <button
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="w-8 h-8 flex items-center justify-center rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
