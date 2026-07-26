"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, Undo2 } from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";

interface OrderReturnRow {
  id: string;
  code: string;
  order_id: string;
  order_code: string;
  customer_name: string;
  refund_amount: number;
  status: "completed" | "cancelled";
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = { completed: "Đã hoàn tất", cancelled: "Đã huỷ" };
const STATUS_CLASS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

export default function OrderReturnsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<OrderReturnRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/order-returns?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tải được danh sách.");
      setRows(data.returns ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error(e);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch]);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, total);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#f4f6f8]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0d1d29]">Đơn trả hàng</h1>
          <p className="text-sm text-[#404754] mt-0.5">
            Danh sách các phiếu trả hàng đã tạo — mỗi phiếu tự động hoàn kho và tạo phiếu chi ở Sổ quỹ.
          </p>
        </div>
        <button
          onClick={() => router.push("/orders/returns/new")}
          className="flex items-center gap-2 px-4 py-2 bg-[#005baf] text-white font-bold rounded-lg hover:bg-[#005eb3] transition-all shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>Tạo đơn trả hàng</span>
        </button>
      </div>

      <div className="bg-white border border-[#c0c6d6] rounded-xl p-4 flex flex-wrap gap-4 items-center shadow-sm">
        <div className="flex-1 min-w-[300px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#404754] w-5 h-5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#f4f6f8] border border-[#c0c6d6] rounded-lg text-sm focus:ring-2 focus:ring-[#005baf] focus:border-[#005baf] outline-none transition-all"
            placeholder="Tìm kiếm theo mã phiếu trả, mã đơn gốc, tên khách hàng"
            type="text"
          />
        </div>
      </div>

      <div className="bg-white border border-[#c0c6d6] rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-[#ebf5ff] border-b border-[#c0c6d6]">
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Mã phiếu trả</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Đơn gốc</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Khách hàng</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Ngày trả</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase text-right">Số tiền hoàn</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c0c6d6]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#005baf] mx-auto" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <Undo2 className="w-10 h-10 text-[#c0c6d6] mx-auto mb-3" />
                    <p className="text-sm text-[#404754]">Chưa có phiếu trả hàng nào.</p>
                    <button
                      onClick={() => router.push("/orders/returns/new")}
                      className="mt-3 text-sm font-semibold text-[#005baf] hover:underline"
                    >
                      Tạo đơn trả hàng đầu tiên
                    </button>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[#ebf5ff] transition-colors">
                    <td className="p-4">
                      <span className="text-[#005baf] font-bold text-sm">{r.code}</span>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => router.push(`/orders/${r.order_id}`)}
                        className="text-sm text-[#005baf] hover:underline"
                      >
                        #{r.order_code}
                      </button>
                    </td>
                    <td className="p-4 text-sm text-[#0d1d29]">{r.customer_name || "Khách lẻ"}</td>
                    <td className="p-4 text-xs text-[#404754]">{fmtDateTime(r.created_at)}</td>
                    <td className="p-4 text-sm font-semibold text-[#ba1a1a] text-right">
                      -{formatCurrencyVND(r.refund_amount)}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${STATUS_CLASS[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-[#ebf5ff] flex items-center justify-between border-t border-[#c0c6d6] flex-wrap gap-3">
          <span className="text-xs text-[#404754]">
            Hiển thị {startIdx} - {endIdx} trong tổng số {total} phiếu trả
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="p-1.5 rounded border border-[#c0c6d6] bg-white disabled:opacity-40 hover:bg-[#f4f6f8]"
            >
              <ChevronLeft className="w-4 h-4 text-[#404754]" />
            </button>
            <span className="px-3 py-1 rounded bg-[#005baf] text-white text-xs font-bold">{safePage}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="p-1.5 rounded border border-[#c0c6d6] bg-white disabled:opacity-40 hover:bg-[#f4f6f8]"
            >
              <ChevronRight className="w-4 h-4 text-[#404754]" />
            </button>
            <span className="text-xs text-[#404754] ml-2">Hiển thị</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="border border-[#c0c6d6] rounded px-2 py-1 text-xs bg-white"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
