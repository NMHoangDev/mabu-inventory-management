"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Plus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Star,
  MessageCircle,
  Calculator,
  HelpCircle,
  Settings,
} from "lucide-react";

type ShippingStatus =
  | "pending"
  | "packing"
  | "awaiting_pickup"
  | "shipping"
  | "delivered"
  | "returning"
  | "cancelled"
  | "returned"
  | "failed";

interface Shipping {
  id: string;
  tracking_code: string;
  order_id: string | null;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  partner: string;
  status: ShippingStatus;
  cod_amount: number;
  shipping_fee: number;
  weight: number;
  branch: string;
  staff: string;
  packed_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

const TABS: { v: "all" | ShippingStatus; label: string }[] = [
  { v: "all", label: "Tất cả vận đơn" },
  { v: "awaiting_pickup", label: "Chờ lấy hàng" },
  { v: "shipping", label: "Đang giao hàng" },
  { v: "delivered", label: "Đã giao hàng" },
  { v: "cancelled", label: "Hủy giao - chờ nhận" },
  { v: "returned", label: "Hủy giao - đã nhận" },
];

const STATUS_BADGE: Record<ShippingStatus, { bg: string; text: string; border: string; label: string }> = {
  pending: { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", label: "Chờ xử lý" },
  packing: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-100", label: "Chờ đóng gói" },
  awaiting_pickup: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-100", label: "Chờ lấy hàng" },
  shipping: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-100", label: "Đang giao" },
  delivered: { bg: "bg-green-50", text: "text-green-700", border: "border-green-100", label: "Đã giao" },
  returning: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-100", label: "Chờ giao lại" },
  cancelled: { bg: "bg-red-50", text: "text-red-700", border: "border-red-100", label: "Hủy đóng gói" },
  returned: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200", label: "Hủy - đã nhận" },
  failed: { bg: "bg-red-50", text: "text-red-700", border: "border-red-100", label: "Giao thất bại" },
};

const fmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export default function ShippingListPage() {
  const router = useRouter();
  const [shippings, setShippings] = useState<Shipping[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]["v"]>("all");
  const [search, setSearch] = useState("");
  const [partner, setPartner] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (tab !== "all") params.set("status", tab);
      if (partner !== "all") params.set("partner", partner);
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      const res = await fetch(`/api/shippings?${params.toString()}`);
      const data = await res.json();
      setShippings(data.orders ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, tab, partner, page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [tab, search, partner]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Top bar */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
        <h1 className="text-xl font-semibold text-slate-800">Danh sách vận đơn</h1>
        <div className="flex items-center gap-6 text-slate-500">
          <div className="flex items-center gap-1 cursor-pointer hover:text-[#0088FF]">
            <Calculator className="w-4 h-4" />
            <span className="text-sm">Tư vấn thuế</span>
          </div>
          <div className="flex items-center gap-1 cursor-pointer hover:text-[#0088FF]">
            <HelpCircle className="w-4 h-4" />
            <span className="text-sm">Trợ giúp</span>
          </div>
          <div className="flex items-center gap-2 cursor-pointer border-l pl-6">
            <div className="w-8 h-8 rounded-full bg-[#0088FF] text-white flex items-center justify-center text-xs font-bold">N</div>
            <span className="text-sm font-medium">NA</span>
            <ChevronDown className="w-3 h-3" />
          </div>
        </div>
      </header>

      {/* Main */}
      <section className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[#f0f2f5]">
        {/* Action row */}
        <div className="flex justify-between items-center">
          <button className="flex items-center gap-2 text-slate-600 hover:text-[#0088FF]">
            <Download className="w-4 h-4" />
            <span className="text-sm font-medium">Xuất file</span>
          </button>
          <button
            onClick={() => router.push("/shipping/orders/new")}
            className="bg-[#0088FF] text-white px-4 py-2 rounded shadow-sm hover:bg-blue-600 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="font-medium">Tạo đơn và giao hàng</span>
          </button>
        </div>

        {/* Filter card */}
        <div className="bg-white rounded shadow-sm flex flex-col">
          {/* Tabs */}
          <div className="flex border-b overflow-x-auto whitespace-nowrap">
            {TABS.map((t) => (
              <button
                key={t.v}
                onClick={() => setTab(t.v)}
                className={`px-4 py-3 text-sm font-medium transition ${
                  tab === t.v
                    ? "border-b-2 border-[#0088FF] text-[#0088FF]"
                    : "text-slate-500 hover:text-[#0088FF]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="p-4 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-[#0088FF] outline-none text-sm"
                placeholder="Tìm kiếm theo mã đơn giao"
                type="text"
              />
            </div>
            <FilterSelect
              value="packed_at"
              options={[
                { v: "packed_at", l: "Ngày đóng gói" },
                { v: "picked_up_at", l: "Ngày lấy hàng" },
                { v: "delivered_at", l: "Ngày giao hàng" },
              ]}
            />
            <FilterSelect
              value="all"
              options={[
                { v: "all", l: "Trạng thái giao hàng" },
                ...Object.entries(STATUS_BADGE).map(([k, v]) => ({ v: k, l: v.label })),
              ]}
            />
            <FilterSelect
              value={partner}
              options={[
                { v: "all", l: "Chi nhánh" },
                { v: "NINJA VAN", l: "Chi nhánh HCM" },
                { v: "JNT Express", l: "Chi nhánh HN" },
              ]}
              onChange={setPartner}
            />
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded text-sm text-slate-600 hover:bg-slate-50">
              <span>Bộ lọc khác</span>
              <Filter className="w-4 h-4 text-slate-400" />
            </button>
            <button className="px-4 py-2 bg-slate-100 text-slate-400 rounded text-sm cursor-not-allowed">
              Lưu bộ lọc
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 border-y border-slate-200">
                <tr>
                  <th className="p-4 w-10">
                    <div className="flex items-center gap-4">
                      <Settings className="w-4 h-4 text-slate-400" />
                      <input className="rounded border-slate-300 text-[#0088FF] focus:ring-[#0088FF]" type="checkbox" />
                    </div>
                  </th>
                  <th className="p-4 font-medium text-slate-600">Mã vận đơn</th>
                  <th className="p-4 font-medium text-slate-600">Ngày đóng gói</th>
                  <th className="p-4 font-medium text-slate-600">Người nhận</th>
                  <th className="p-4 font-medium text-slate-600">SĐT người nhận</th>
                  <th className="p-4 font-medium text-slate-600">Đối tác vận chuyển</th>
                  <th className="p-4 font-medium text-slate-600">Trạng thái giao hàng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin h-5 w-5 border-2 border-[#0088FF] border-t-transparent rounded-full" />
                        Đang tải...
                      </div>
                    </td>
                  </tr>
                ) : shippings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      Chưa có vận đơn nào. Nhấn "Tạo đơn và giao hàng" để bắt đầu.
                    </td>
                  </tr>
                ) : (
                  shippings.map((s) => {
                    const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.pending;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => router.push(`/shipping/orders/${s.id}`)}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-4">
                            <ChevronRight />
                            <input className="rounded border-slate-300 text-[#0088FF]" type="checkbox" />
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="text-[#0088FF] font-medium">{s.tracking_code}</span>
                        </td>
                        <td className="p-4">{fmtDate(s.packed_at)}</td>
                        <td className="p-4">{s.customer_name}</td>
                        <td className="p-4">{s.customer_phone || "—"}</td>
                        <td className="p-4">{s.partner || "—"}</td>
                        <td className="p-4">
                          <span className={`status-badge border ${badge.border} ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Hiển thị</span>
              <div className="relative">
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="border border-slate-300 rounded px-2 py-1 bg-white appearance-none pr-6"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-slate-400" />
              </div>
              <span className="text-slate-500 whitespace-nowrap">
                kết quả Từ {shippings.length === 0 ? 0 : (page - 1) * pageSize + 1} đến {Math.min(page * pageSize, total)} trên tổng {total}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center text-slate-300 hover:bg-slate-100 rounded-full disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(6, totalPages) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-full text-sm ${p === page ? "bg-[#0088FF] text-white font-medium" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-full disabled:text-slate-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Floating feedback tab */}
      <div className="fixed right-0 top-1/2 -translate-y-1/2 bg-[#0088FF] text-white py-2 px-1 rounded-l text-xs z-40 cursor-pointer hover:bg-blue-600" style={{ writingMode: "vertical-rl" }}>
        <div className="flex flex-col items-center gap-1">
          <span>Đánh giá vận chuyển</span>
          <Star className="w-3 h-3" />
        </div>
      </div>

      {/* Help bubble */}
      <div className="fixed bottom-4 right-4 z-50">
        <button className="w-12 h-12 bg-[#0088FF] rounded-full shadow-lg flex items-center justify-center text-white cursor-pointer hover:scale-105 transition">
          <MessageCircle className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { v: string; l: string }[];
  onChange?: (v: string) => void;
}) {
  return (
    <div className="relative min-w-[150px]">
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded text-sm appearance-none bg-white"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>{o.l}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
    </div>
  );
}
