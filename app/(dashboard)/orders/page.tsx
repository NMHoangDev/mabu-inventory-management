"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Calendar as CalendarIcon,
  ChevronDown,
  Filter,
  ChevronLeft,
  ChevronRight,
  ReceiptText,
  Hourglass,
  CreditCard,
  Truck as ShippingIcon,
  CheckCircle2,
  TrendingUp,
  Lightbulb,
  ArrowRight,
  Headphones,
  Download,
  Upload,
} from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";
import { ExcelExportDialog, type ExportScope } from "@/components/shared/ExcelExportDialog";
import { ORDER_EXPORT_GROUPS, ORDER_EXPORT_TYPE_OPTIONS } from "@/lib/orders/export-fields";
import { ImportExcelModal } from "@/components/imports/ImportExcelModal";
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { PageGuard } from "@/components/auth/PageGuard";

interface OrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string;
  unit: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Order {
  id: string;
  code: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  status: "new" | "processing" | "completed" | "cancelled";
  payment_status: "unpaid" | "partial" | "paid" | "refunded";
  fulfillment_status: "unshipped" | "shipping" | "shipped" | "returned";
  source: string;
  branch: string;
  staff: string;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  paid: number;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

interface OrderStats {
  pending: number;
  awaiting_payment: number;
  awaiting_shipment: number;
  completed_today: number;
  revenue_today: number;
}

const STATUS_LABEL: Record<string, string> = {
  new: "Mới",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  cancelled: "Huỷ bỏ",
};

const SOURCE_LABEL: Record<string, string> = {
  store: "Tại cửa hàng",
  facebook: "Facebook",
  website: "Website",
  zalo: "Zalo",
  other: "Khác",
  pos: "Bán tại quầy (POS)",
};
const STATUS_CLASS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const PAY_LABEL: Record<string, string> = {
  unpaid: "Chờ thanh toán",
  partial: "Thanh toán một phần",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
};
const PAY_CLASS: Record<string, string> = {
  unpaid: "bg-orange-100 text-orange-700",
  partial: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  refunded: "bg-gray-100 text-gray-500",
};

const SHIP_LABEL: Record<string, string> = {
  unshipped: "Chưa xử lý",
  confirmed: "Đã xác nhận",
  packing: "Đang đóng gói",
  shipping: "Đang giao",
  shipped: "Đã giao",
  returned: "Đã trả hàng",
};
const SHIP_CLASS: Record<string, string> = {
  unshipped: "bg-gray-100 text-gray-600",
  confirmed: "bg-blue-100 text-blue-700",
  packing: "bg-purple-100 text-purple-700",
  shipping: "bg-orange-100 text-orange-700",
  shipped: "bg-green-100 text-green-700",
  returned: "bg-gray-100 text-gray-500",
};

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function initials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}
function avatarColor(name: string) {
  const palette = [
    "bg-blue-100 text-blue-700",
    "bg-purple-100 text-purple-700",
    "bg-yellow-100 text-yellow-700",
    "bg-red-100 text-red-700",
    "bg-emerald-100 text-emerald-700",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
function phoneMask(phone: string) {
  if (!phone) return "";
  if (phone.length < 7) return phone;
  return phone.substring(0, 3) + "***" + phone.substring(phone.length - 4);
}

export default function OrdersPage() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<OrderStats>({
    pending: 0,
    awaiting_payment: 0,
    awaiting_shipment: 0,
    completed_today: 0,
    revenue_today: 0,
  });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "draft" | "returned" | "pos">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [dateFilter, setDateFilter] = useState<string>("today");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [shipmentFilter, setShipmentFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>("all");
  const [exportType, setExportType] = useState("order_summary");
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const currentFilters = useMemo(
    () => ({
      search: search || undefined,
      status: tab === "draft" ? "new" : undefined,
      fulfillment_status: tab === "returned" ? "returned" : shipmentFilter !== "all" ? shipmentFilter : undefined,
      source: tab === "pos" ? "pos" : sourceFilter !== "all" ? sourceFilter : undefined,
      payment_status: paymentFilter !== "all" ? paymentFilter : undefined,
      page,
      page_size: pageSize,
    }),
    [search, tab, shipmentFilter, sourceFilter, paymentFilter, page, pageSize]
  );

  const handleExportSubmit = useCallback(
    async (selection: { fields: string[]; scope: ExportScope; exportType?: string }) => {
      setExporting(true);
      try {
        const res = await fetch("/api/orders/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: selection.scope,
            filters: currentFilters,
            exportType: selection.exportType,
            fields: selection.fields,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `don-hang-${Date.now()}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        setExportOpen(false);
      } catch (e) {
        console.error(e);
        alert(e instanceof Error ? e.message : "Không xuất được file.");
      } finally {
        setExporting(false);
      }
    },
    [currentFilters]
  );

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (tab === "draft") params.set("status", "new");
      if (tab === "returned") params.set("fulfillment_status", "returned");
      if (tab === "pos") params.set("source", "pos");
      if (paymentFilter !== "all") params.set("payment_status", paymentFilter);
      if (shipmentFilter !== "all") params.set("fulfillment_status", shipmentFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
      setStats(data.stats ?? stats);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tab, page, pageSize, paymentFilter, shipmentFilter, sourceFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setPage(1);
  }, [tab, search, paymentFilter, shipmentFilter, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <PageGuard permission="orders.view">
    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#f4f6f8]">
      {/* Quick Stats Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Chờ duyệt"
          value={stats.pending}
          delta="+2"
          icon={<Hourglass className="text-blue-600 w-5 h-5" />}
          iconBg="bg-blue-50"
        />
        <StatCard
          label="Chờ thanh toán"
          value={stats.awaiting_payment}
          delta="+8"
          icon={<CreditCard className="text-orange-600 w-5 h-5" />}
          iconBg="bg-orange-50"
          deltaColor="text-orange-600 bg-orange-50"
        />
        <StatCard
          label="Chờ giao hàng"
          value={stats.awaiting_shipment}
          delta="+5"
          icon={<ShippingIcon className="text-purple-600 w-5 h-5" />}
          iconBg="bg-purple-50"
          deltaColor="text-purple-600 bg-purple-50"
        />
        <StatCard
          label="Hoàn tất (Hôm nay)"
          value={stats.completed_today}
          delta="25%"
          icon={<CheckCircle2 className="text-green-600 w-5 h-5" />}
          iconBg="bg-green-50"
          deltaColor="text-green-600 bg-green-50"
        />
        <div className="bg-white border border-[#c0c6d6] p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-[#005baf]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#005baf] uppercase tracking-tight">Doanh thu hôm nay</span>
            <div className="w-8 h-8 rounded-full bg-[#d5e3ff] flex items-center justify-center">
              <TrendingUp className="text-[#005baf] w-5 h-5" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-[#005baf]">{formatCurrencyVND(stats.revenue_today)}</span>
            <span className="text-xs text-[#404754]">
              {stats.completed_today > 0 ? `+${stats.completed_today} đơn hoàn tất` : "Chưa có đơn hôm nay"}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#c0c6d6] rounded-xl p-4 flex flex-wrap gap-4 items-center shadow-sm">
          <div className="flex-1 min-w-[300px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#404754] w-5 h-5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#f4f6f8] border border-[#c0c6d6] rounded-lg text-sm focus:ring-2 focus:ring-[#005baf] focus:border-[#005baf] outline-none transition-all"
              placeholder="Tìm kiếm theo mã đơn hàng, tên hoặc SĐT khách hàng..."
              type="text"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              icon={<CalendarIcon className="w-5 h-5" />}
              label={`Thời gian: ${dateFilter === "today" ? "Hôm nay" : dateFilter === "week" ? "Tuần này" : dateFilter === "month" ? "Tháng này" : "Tất cả"}`}
            />
            <FilterDropdown
              label={paymentFilter === "all" ? "Trạng thái thanh toán" : PAY_LABEL[paymentFilter] ?? "Trạng thái thanh toán"}
              options={[{ v: "all", l: "Tất cả" }, ...Object.keys(PAY_LABEL).map((k) => ({ v: k, l: PAY_LABEL[k] }))]}
              value={paymentFilter}
              onChange={setPaymentFilter}
            />
            <FilterDropdown
              label={shipmentFilter === "all" ? "Trạng thái giao hàng" : SHIP_LABEL[shipmentFilter] ?? "Trạng thái giao hàng"}
              options={[{ v: "all", l: "Tất cả" }, ...Object.keys(SHIP_LABEL).map((k) => ({ v: k, l: SHIP_LABEL[k] }))]}
              value={shipmentFilter}
              onChange={setShipmentFilter}
            />
            <FilterDropdown
              icon={<Filter className="w-5 h-5" />}
              label={sourceFilter === "all" ? "Nguồn đơn" : SOURCE_LABEL[sourceFilter] ?? "Nguồn đơn"}
              options={[{ v: "all", l: "Tất cả" }, ...Object.keys(SOURCE_LABEL).map((k) => ({ v: k, l: SOURCE_LABEL[k] }))]}
              value={sourceFilter}
              onChange={setSourceFilter}
            />
            {hasPermission("orders.import") ? (
              <button
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#c0c6d6] text-[#404754] font-medium rounded-lg hover:bg-gray-50 transition-all"
              >
                <Upload className="w-4 h-4" />
                <span>Nhập file</span>
              </button>
            ) : null}
            {hasPermission("orders.export") ? (
              <button
                onClick={() => setExportOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#c0c6d6] text-[#404754] font-medium rounded-lg hover:bg-gray-50 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Xuất file</span>
              </button>
            ) : null}
            {hasPermission("orders.create") ? (
              <button
                onClick={() => router.push("/orders/new")}
                className="flex items-center gap-2 px-4 py-2 bg-[#005baf] text-white font-bold rounded-lg hover:bg-[#005eb3] transition-all shadow-sm"
              >
                <Plus className="w-5 h-5" />
                <span>Tạo đơn hàng</span>
              </button>
            ) : null}
          </div>
      </div>

      <ExcelExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="Xuất file danh sách đơn hàng"
        fieldPickerTitle="Tùy chọn trường hiển thị xuất file đơn hàng"
        groups={ORDER_EXPORT_GROUPS}
        scope={{
          value: exportScope,
          onChange: setExportScope,
          currentPageCount: orders.length,
          totalCount: total,
        }}
        exportType={{ value: exportType, onChange: setExportType, options: ORDER_EXPORT_TYPE_OPTIONS }}
        onSubmit={handleExportSubmit}
        submitting={exporting}
      />

      {importOpen && (
        <ImportExcelModal
          title="Nhập file danh sách đơn hàng"
          templateUrl="/api/orders/import/template"
          parseUrl="/api/orders/import"
          commitUrl="/api/orders/import"
          kind="orders"
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            fetchOrders();
          }}
        />
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#c0c6d6]">
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>Tất cả đơn hàng</TabButton>
        <TabButton active={tab === "draft"} onClick={() => setTab("draft")}>Đơn draft</TabButton>
        <TabButton active={tab === "returned"} onClick={() => setTab("returned")}>Đơn hoàn trả</TabButton>
        <TabButton active={tab === "pos"} onClick={() => setTab("pos")}>Đơn từ POS</TabButton>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-[#c0c6d6] rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-[#ebf5ff] border-b border-[#c0c6d6]">
                <th className="p-4 w-12 text-center">
                  <input className="w-4 h-4 rounded border-[#c0c6d6] text-[#005baf] focus:ring-[#005baf]" type="checkbox" />
                </th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Mã đơn hàng</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Ngày tạo</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Khách hàng</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Trạng thái đơn</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Thanh toán</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Giao hàng</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase text-right">Tổng tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c0c6d6]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-[#404754]">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin h-5 w-5 border-2 border-[#005baf] border-t-transparent rounded-full" />
                      Đang tải...
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-[#404754]">
                    <div className="flex flex-col items-center gap-2">
                      <ReceiptText className="w-10 h-10 text-[#c0c6d6]" />
                      <p>Chưa có đơn hàng nào. Nhấn "Tạo đơn hàng" để bắt đầu.</p>
                      {hasPermission("orders.create") ? (
                        <button
                          onClick={() => router.push("/orders/new")}
                          className="mt-2 px-4 py-2 bg-[#005baf] text-white text-sm rounded-lg"
                        >
                          Tạo đơn hàng đầu tiên
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => router.push(`/orders/${o.id}`)}
                    className="hover:bg-[#ebf5ff] transition-colors cursor-pointer"
                  >
                    <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <input className="w-4 h-4 rounded border-[#c0c6d6] text-[#005baf] focus:ring-[#005baf]" type="checkbox" />
                    </td>
                    <td className="p-4">
                      <span className="text-[#005baf] font-bold text-sm hover:underline">#{o.code}</span>
                    </td>
                    <td className="p-4 text-xs text-[#404754]">{fmtDate(o.created_at)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${avatarColor(o.customer_name)}`}>
                          {initials(o.customer_name)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#0d1d29]">{o.customer_name || "Khách lẻ"}</p>
                          <p className="text-[11px] text-[#404754]">{phoneMask(o.customer_phone) || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${STATUS_CLASS[o.status]}`}>
                        {STATUS_LABEL[o.status]}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${PAY_CLASS[o.payment_status]}`}>
                        {PAY_LABEL[o.payment_status]}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${SHIP_CLASS[o.fulfillment_status]}`}>
                        {SHIP_LABEL[o.fulfillment_status]}
                      </span>
                    </td>
                    <td className="p-4 text-right font-medium text-[#0d1d29]">{formatCurrencyVND(o.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 bg-[#ebf5ff] flex items-center justify-between border-t border-[#c0c6d6]">
          <div className="text-xs text-[#404754]">
            Hiển thị {orders.length === 0 ? 0 : (page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} trong tổng số {total} đơn hàng
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 flex items-center justify-center rounded border border-[#c0c6d6] hover:bg-white transition-colors disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <PageButton active={page === 1} onClick={() => setPage(1)}>1</PageButton>
            {totalPages > 2 && page < totalPages - 1 && (
              <PageButton active={false} onClick={() => setPage(page + 1)}>{page + 1}</PageButton>
            )}
            {totalPages > 2 && page >= totalPages - 1 && (
              <PageButton active={false} onClick={() => setPage(totalPages - 1)}>{totalPages - 1}</PageButton>
            )}
            {totalPages > 1 && (
              <PageButton active={page === totalPages} onClick={() => setPage(totalPages)}>{totalPages}</PageButton>
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-8 h-8 flex items-center justify-center rounded border border-[#c0c6d6] hover:bg-white transition-colors disabled:opacity-50"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="ml-4 flex items-center gap-2">
              <span className="text-xs text-[#404754]">Hiển thị</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="bg-white border border-[#c0c6d6] rounded px-2 py-1 text-xs focus:ring-[#005baf] outline-none"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Help cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-gradient-to-r from-[#005baf]/5 to-[#005baf]/10 border border-[#005baf]/20 rounded-xl p-6 relative overflow-hidden flex items-center justify-between">
          <div className="z-10 max-w-lg">
            <h3 className="text-lg font-semibold text-[#005baf] mb-2">Tối ưu hóa quy trình giao nhận</h3>
            <p className="text-sm text-[#404754] mb-4">
              Kết nối với các đối tác vận chuyển uy tín như Giao Hàng Tiết Kiệm, Giao Hàng Nhanh trực tiếp trên Sapo để tự động hóa việc đẩy đơn và tra cứu hành trình.
            </p>
            <button className="px-4 py-2 bg-white text-[#005baf] font-bold rounded-lg border border-[#005baf]/20 hover:bg-[#005baf]/5 transition-all">
              Kết nối ngay
            </button>
          </div>
          <ShippingIcon className="absolute right-0 top-0 bottom-0 w-1/3 text-[#005baf] opacity-20 pointer-events-none" size={160} />
        </div>
        <div className="bg-white border border-[#c0c6d6] rounded-xl p-6 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-[#ebf5ff] rounded-full flex items-center justify-center mb-4">
            <Lightbulb className="text-[#005baf] w-8 h-8" />
          </div>
          <h4 className="text-sm font-bold text-[#0d1d29] mb-1">Xem báo cáo chi tiết</h4>
          <p className="text-xs text-[#404754] mb-4">Phân tích hiệu quả kinh doanh của bạn theo tuần, tháng.</p>
          <Link href="/reports" className="text-[#005baf] font-bold text-xs flex items-center hover:underline">
            Đến trang báo cáo
            <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </div>
      </div>

      {/* FAB */}
      <div className="fixed bottom-8 right-8 z-50">
        <button className="w-14 h-14 bg-[#005baf] text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group" title="Hỗ trợ nhanh">
          <Headphones className="w-7 h-7" />
          <span className="absolute right-16 bg-[#22323e] text-white px-3 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Hỗ trợ trực tuyến
          </span>
        </button>
      </div>
    </div>
    </PageGuard>
  );
}

function StatCard({
  label,
  value,
  delta,
  icon,
  iconBg,
  deltaColor = "text-blue-600 bg-blue-50",
}: {
  label: string;
  value: number;
  delta: string;
  icon: React.ReactNode;
  iconBg: string;
  deltaColor?: string;
}) {
  return (
    <div className="bg-white border border-[#c0c6d6] p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#404754] uppercase tracking-tight">{label}</span>
        <div className={`w-8 h-8 rounded-full ${iconBg} flex items-center justify-center`}>{icon}</div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-[#0d1d29]">{value}</span>
        <span className={`text-[10px] px-1 rounded ${deltaColor}`}>{delta}</span>
      </div>
    </div>
  );
}

function FilterDropdown({
  label,
  icon,
  options,
  value,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  options?: { v: string; l: string }[];
  value?: string;
  onChange?: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => options ? setOpen(!open) : undefined}
        className="flex items-center gap-2 px-3 py-2 bg-[#f4f6f8] border border-[#c0c6d6] rounded-lg hover:bg-[#ebf5ff] transition-colors text-sm"
      >
        {icon}
        <span className="text-xs">{label}</span>
        <ChevronDown className="w-4 h-4" />
      </button>
      {options && open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-[#c0c6d6] rounded-lg shadow-lg min-w-[180px] py-1">
          {options.map((o) => (
            <button
              key={o.v}
              onClick={() => { onChange?.(o.v); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#ebf5ff] ${
                (value ?? "all") === o.v ? "bg-[#ebf5ff] text-[#005baf] font-medium" : "text-[#0d1d29]"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium transition-colors duration-200 ${
        active
          ? "text-[#005baf] font-bold border-b-2 border-[#005baf]"
          : "text-[#404754] hover:bg-[#ebf5ff]"
      }`}
    >
      {children}
    </button>
  );
}

function PageButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`w-8 h-8 flex items-center justify-center rounded text-xs ${
        active
          ? "bg-[#005baf] text-white font-bold"
          : "border border-[#c0c6d6] hover:bg-white text-[#0d1d29]"
      }`}
    >
      {children}
    </button>
  );
}
