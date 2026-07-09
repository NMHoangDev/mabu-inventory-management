"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { downloadCsv } from "@/lib/shared/csv-export";
import {
  Loader2,
  Plus,
  Download,
  ChevronLeft,
  ChevronRight,
  FileText,
  Settings
} from "lucide-react";

type AdjStatus = "draft" | "completed" | "cancelled";

interface AdjRow {
  id: string;
  code: string;
  branch: string;
  staff: string;
  status: AdjStatus;
  total_items: number;
  created_at: string;
}

const STATUS_META: Record<AdjStatus, { label: string; className: string }> = {
  draft: { label: "Nháp", className: "bg-slate-100 text-slate-600" },
  completed: { label: "Hoàn thành", className: "bg-green-100 text-green-700" },
  cancelled: { label: "Đã hủy", className: "bg-red-100 text-red-700" }
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

export default function CostAdjustmentsListPage() {
  const [rows, setRows] = useState<AdjRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cost-adjustments")
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        (r.staff ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageRows = filtered.slice(startIdx, endIdx);

  useEffect(() => { if (page > totalPages) setPage(1); }, [page, totalPages]);

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      <header className="h-14 bg-white border-b px-6 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-slate-800">Điều chỉnh giá vốn</h1>
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
              downloadCsv(`dieu-chinh-gia-von-${Date.now()}.csv`, filtered, [
                { label: "Mã phiếu", value: (r) => r.code },
                { label: "Ngày tạo", value: (r) => formatDate(r.created_at) },
                { label: "Chi nhánh", value: (r) => r.branch || "Chi nhánh mặc định" },
                { label: "Người tạo", value: (r) => r.staff },
                { label: "Số sản phẩm", value: (r) => r.total_items },
                { label: "Trạng thái", value: (r) => STATUS_META[r.status]?.label ?? r.status },
              ])
            }
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600"
          >
            <Download className="w-4 h-4" /> Xuất file
          </button>
        </div>
        <Link
          href="/products/cost-adjustments/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Tạo phiếu điều chỉnh
        </Link>
      </div>

      <div className="bg-white px-4 pt-2 border-b flex-shrink-0">
        <div className="py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-2xl">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2" />
              </svg>
            </span>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Tìm mã phiếu, nhân viên"
              className="pl-10 block w-full border-slate-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select className="border-slate-300 rounded-md text-sm py-2 px-3">
            <option>Trạng thái</option>
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
          <table className="w-full text-sm text-left min-w-[800px]">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b">
              <tr>
                <th className="p-3 w-10"><input type="checkbox" className="rounded border-slate-300" /></th>
                <th className="p-3 text-slate-600 font-semibold">Mã phiếu</th>
                <th className="p-3 text-slate-600 font-semibold">Ngày tạo ▼</th>
                <th className="p-3 text-slate-600 font-semibold">Chi nhánh</th>
                <th className="p-3 text-slate-600 font-semibold">Người tạo</th>
                <th className="p-3 text-slate-600 font-semibold text-right">Số sản phẩm</th>
                <th className="p-3 text-slate-600 font-semibold text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    {rows.length === 0
                      ? "Chưa có phiếu điều chỉnh nào. Bấm \"Tạo phiếu điều chỉnh\" để bắt đầu."
                      : "Không tìm thấy phiếu nào phù hợp."}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const meta = STATUS_META[row.status] ?? STATUS_META.draft;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3"><input type="checkbox" className="rounded border-slate-300" /></td>
                      <td className="p-3">
                        <Link href={`/products/cost-adjustments/${row.id}`} className="text-blue-600 font-medium hover:underline">
                          {row.code}
                        </Link>
                      </td>
                      <td className="p-3 text-slate-500">{formatDate(row.created_at)}</td>
                      <td className="p-3">{row.branch || "Chi nhánh mặc định"}</td>
                      <td className="p-3">{row.staff || "—"}</td>
                      <td className="p-3 text-right tabular-nums">{row.total_items}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${meta.className}`}>
                          {meta.label}
                        </span>
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
          <select value={pageSize} className="border-slate-300 rounded text-xs py-1 px-2">
            <option value="20">20</option><option value="50">50</option><option value="100">100</option>
          </select>
          <span>kết quả</span>
          <span className="ml-3">Từ {total === 0 ? 0 : startIdx + 1} đến {endIdx} trên tổng {total}</span>
        </div>
        <div className="flex items-center gap-1">
          <button disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="w-8 h-8 flex items-center justify-center rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3">Trang {safePage} / {totalPages}</span>
          <button disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="w-8 h-8 flex items-center justify-center rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
