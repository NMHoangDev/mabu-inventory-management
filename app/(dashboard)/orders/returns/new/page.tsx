"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search, Undo2 } from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";
import { PageGuard } from "@/components/auth/PageGuard";

interface ReturnableOrderRow {
  id: string;
  code: string;
  created_at: string;
  staff: string;
  customer_name: string;
  customer_phone: string;
  total: number;
}

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

/** "Chọn đơn hàng để trả" — đúng mẫu Sapo: danh sách đơn đủ điều kiện trả
 *  (đã hoàn tất, đã trừ kho, còn ít nhất 1 dòng chưa trả hết — xem quy tắc ở
 *  lib/order-returns/repository.ts listReturnableOrders). */
export default function PickOrderToReturnPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ReturnableOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/order-returns/returnable?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tải được danh sách.");
      setRows(data.orders ?? []);
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
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, total);

  return (
    <PageGuard permission="order_returns.create">
    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#f4f6f8]">
      <div>
        <h1 className="text-xl font-bold text-[#0d1d29]">Chọn đơn hàng để trả</h1>
        <p className="text-sm text-[#404754] mt-0.5">
          Chỉ hiện các đơn đã hoàn tất, đã trừ kho, và còn sản phẩm chưa trả hết.
        </p>
      </div>

      <div className="bg-white border border-[#c0c6d6] rounded-xl p-4 flex flex-wrap gap-4 items-center shadow-sm">
        <div className="flex-1 min-w-[300px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#404754] w-5 h-5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#f4f6f8] border border-[#c0c6d6] rounded-lg text-sm focus:ring-2 focus:ring-[#005baf] focus:border-[#005baf] outline-none transition-all"
            placeholder="Tìm kiếm theo mã đơn hàng, tên, SĐT khách hàng"
            type="text"
          />
        </div>
      </div>

      <div className="bg-white border border-[#c0c6d6] rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-[#ebf5ff] border-b border-[#c0c6d6]">
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Mã đơn hàng</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Ngày tạo</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Nhân viên</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Khách hàng</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase text-right">Tổng tiền</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase text-center">Thao tác</th>
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
                    <p className="text-sm text-[#404754]">Không có đơn hàng nào đủ điều kiện trả.</p>
                  </td>
                </tr>
              ) : (
                rows.map((o) => (
                  <tr key={o.id} className="hover:bg-[#ebf5ff] transition-colors">
                    <td className="p-4">
                      <span className="text-[#005baf] font-bold text-sm">#{o.code}</span>
                    </td>
                    <td className="p-4 text-xs text-[#404754]">{fmtDateTime(o.created_at)}</td>
                    <td className="p-4 text-sm text-[#0d1d29]">{o.staff || "—"}</td>
                    <td className="p-4">
                      <div className="text-sm text-[#0d1d29]">{o.customer_name || "Khách lẻ"}</div>
                      {o.customer_phone && <div className="text-xs text-[#404754]">{o.customer_phone}</div>}
                    </td>
                    <td className="p-4 text-sm font-semibold text-[#0d1d29] text-right">
                      {formatCurrencyVND(o.total)}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => router.push(`/orders/returns/new/${o.id}`)}
                        className="px-3 py-1.5 bg-[#005baf] hover:bg-[#005eb3] text-white text-xs font-semibold rounded transition-colors"
                      >
                        Đổi trả
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-[#ebf5ff] flex items-center justify-between border-t border-[#c0c6d6] flex-wrap gap-3">
          <span className="text-xs text-[#404754]">
            Hiển thị {startIdx} - {endIdx} trong tổng số {total} đơn hàng
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
          </div>
        </div>
      </div>
    </div>
    </PageGuard>
  );
}
