"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrencyVND } from "@/lib/shared/format";
import {
  Box,
  Clock,
  Truck,
  CheckCircle2,
  RotateCcw,
  XCircle,
  Inbox,
  HelpCircle,
  Download,
  MessageCircle,
  Info,
  Calendar as CalendarIcon,
} from "lucide-react";

interface ShippingStats {
  packing: number;
  awaiting_pickup: number;
  shipping: number;
  delivered: number;
  re_delivery: number;
  cancel_pending: number;
  cancel_received: number;
  audit: {
    collecting: { orders: number; cod: number; fee: number };
    waiting_audit: { orders: number; cod: number; fee: number };
    audited: { orders: number; cod: number; fee: number };
  };
  delivery_success_rate: number;
}

function todayRange() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const seven = new Date(d.getTime() - 6 * 24 * 60 * 60 * 1000);
  const d2 = String(seven.getDate()).padStart(2, "0");
  const m2 = String(seven.getMonth() + 1).padStart(2, "0");
  return `${d2}/${mm}/${yyyy} đến ${dd}/${mm}/${yyyy}`;
}

export default function ShippingOverviewPage() {
  const [stats, setStats] = useState<ShippingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"day" | "month">("day");
  const [showShippingTip, setShowShippingTip] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/shippings?page=1&page_size=1");
      const data = await res.json();
      setStats(data.stats ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const s = stats;
  const dateRange = useMemo(todayRange, []);
  const auditTotal = useMemo(() => {
    if (!s) return { orders: 0, cod: 0, fee: 0 };
    return {
      orders: s.audit.collecting.orders + s.audit.waiting_audit.orders + s.audit.audited.orders,
      cod: s.audit.collecting.cod + s.audit.waiting_audit.cod + s.audit.audited.cod,
      fee: s.audit.collecting.fee + s.audit.waiting_audit.fee + s.audit.audited.fee,
    };
  }, [s]);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Tổng quan vận chuyển</h1>
        <div className="relative w-64">
          <select className="w-full text-sm border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
            <option>Chọn chi nhánh</option>
          </select>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Status + Audit */}
        <section>
          <h2 className="text-lg font-medium mb-4 text-slate-800">Tình hình giao hàng và đối soát</h2>
          <div className="grid grid-cols-12 gap-6">
            {/* Status cards */}
            <div className="col-span-8 bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Tình hình giao hàng</h3>
              </div>
              <p className="text-xs text-slate-400 mb-6">Dữ liệu được tổng hợp trong 30 ngày gần nhất</p>

              <div className="grid grid-cols-4 gap-4 mb-8">
                <StatusCard icon={<Box className="w-8 h-8 text-slate-400" />} label="Chờ đóng gói" value={s?.packing ?? 0} tip />
                <StatusCard icon={<Clock className="w-8 h-8 text-slate-400" />} label="Chờ shipper lấy hàng" value={s?.awaiting_pickup ?? 0} />
                <StatusCard icon={<Truck className="w-8 h-8 text-slate-400" />} label="Đang giao hàng" value={s?.shipping ?? 0} />
                <StatusCard icon={<CheckCircle2 className="w-8 h-8 text-slate-400" />} label="Đã giao hàng" value={s?.delivered ?? 0} />
              </div>

              <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
                <StatusCard small icon={<RotateCcw className="w-6 h-6 text-slate-400" />} label="Chờ giao lại" value={s?.re_delivery ?? 0} tip />
                <StatusCard small icon={<XCircle className="w-6 h-6 text-slate-400" />} label="Hủy giao - chờ nhận" value={s?.cancel_pending ?? 0} />
                <StatusCard small icon={<Inbox className="w-6 h-6 text-slate-400" />} label="Hủy giao - đã nhận" value={s?.cancel_received ?? 0} />
              </div>
            </div>

            {/* Audit table */}
            <div className="col-span-4 bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                  Tình hình đối soát <HelpCircle className="w-3 h-3 text-blue-400" />
                </h3>
                <select className="text-xs border-slate-200 rounded p-1">
                  <option>Tất cả đối tác</option>
                </select>
              </div>
              <p className="text-xs text-slate-400 mb-4">Dữ liệu được tổng hợp trong 30 ngày gần nhất</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 font-medium">
                    <th className="text-left pb-4">Trạng thái</th>
                    <th className="text-right pb-4">Số đơn</th>
                    <th className="text-right pb-4">Tiền thu hộ</th>
                    <th className="text-right pb-4">Phí trả ĐTVC <HelpCircle className="w-3 h-3 text-slate-300 inline" /></th>
                  </tr>
                </thead>
                <tbody className="text-slate-600 divide-y divide-slate-100">
                  <tr>
                    <td className="py-3 text-blue-500">Đang thu hộ <HelpCircle className="w-3 h-3 inline" /></td>
                    <td className="text-right py-3">{s?.audit.collecting.orders ?? 0}</td>
                    <td className="text-right py-3">{formatCurrencyVND(s?.audit.collecting.cod ?? 0)}</td>
                    <td className="text-right py-3">{formatCurrencyVND(s?.audit.collecting.fee ?? 0)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-blue-500">Chờ đối soát <HelpCircle className="w-3 h-3 inline" /></td>
                    <td className="text-right py-3">{s?.audit.waiting_audit.orders ?? 0}</td>
                    <td className="text-right py-3">{formatCurrencyVND(s?.audit.waiting_audit.cod ?? 0)}</td>
                    <td className="text-right py-3">{formatCurrencyVND(s?.audit.waiting_audit.fee ?? 0)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-blue-500">Đã đối soát <HelpCircle className="w-3 h-3 inline" /></td>
                    <td className="text-right py-3">{s?.audit.audited.orders ?? 0}</td>
                    <td className="text-right py-3">{formatCurrencyVND(s?.audit.audited.cod ?? 0)}</td>
                    <td className="text-right py-3">{formatCurrencyVND(s?.audit.audited.fee ?? 0)}</td>
                  </tr>
                  <tr className="font-bold text-slate-800">
                    <td className="py-4">Tổng</td>
                    <td className="text-right py-4">{auditTotal.orders}</td>
                    <td className="text-right py-4">{formatCurrencyVND(auditTotal.cod)}</td>
                    <td className="text-right py-4">{formatCurrencyVND(auditTotal.fee)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Metrics filters */}
        <section>
          <h2 className="text-lg font-medium mb-4 text-slate-800">Các chỉ số vận chuyển</h2>
          <div className="flex gap-4 mb-4">
            <div className="relative w-64">
              <input
                readOnly
                className="w-full text-sm border-slate-300 rounded-md pr-10 bg-white"
                value={dateRange}
              />
              <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
            <div className="relative w-48">
              <select className="w-full text-sm border-slate-300 rounded-md">
                <option>Chọn tỉnh thành</option>
              </select>
            </div>
          </div>
        </section>

        {/* Orders + Fee chart */}
        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-600 uppercase">Tổng số vận đơn và phí trả đối tác</h3>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-6 mb-8 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Hiển thị theo:</span>
                <button
                  onClick={() => setView("day")}
                  className={`px-2 py-0.5 rounded ${view === "day" ? "bg-blue-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  Ngày
                </button>
                <button
                  onClick={() => setView("month")}
                  className={`px-2 py-0.5 rounded ${view === "month" ? "bg-blue-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  Tháng
                </button>
              </div>
              <div className="flex items-center gap-4 ml-auto">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-blue-400 rounded-sm" />
                  <span>Số đơn</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-orange-500 rounded-sm" />
                  <span>Phí vận chuyển</span>
                </div>
              </div>
            </div>
            <EmptyChart message="Chưa có đủ dữ liệu để hiển thị biểu đồ" />
          </div>
        </section>

        {/* Ratios + Detail report */}
        <section className="grid grid-cols-12 gap-6">
          <div className="col-span-9 bg-white border border-slate-200 rounded-lg p-6 flex items-center justify-around h-96">
            <div className="text-center w-1/2">
              <h4 className="text-sm font-semibold text-slate-700 mb-12">Tỉ trọng vận đơn</h4>
              <EmptyChart message="Không có dữ liệu trả về" small />
            </div>
            <div className="text-center w-1/2 border-l border-slate-100">
              <h4 className="text-sm font-semibold text-slate-700 mb-12">Tỉ trọng phí vận chuyển</h4>
              <EmptyChart message="Không có dữ liệu trả về" small />
            </div>
          </div>
          <div className="col-span-3 bg-white border border-slate-200 rounded-lg p-6 flex flex-col">
            <select className="text-xs border-slate-200 rounded mb-6">
              <option>Tất cả đối tác</option>
            </select>
            <h4 className="text-sm font-semibold text-slate-700 mb-4">Báo cáo chi tiết</h4>
            <div className="space-y-3 text-sm">
              <ReportRow label="Tổng vận đơn" value={auditTotal.orders} />
              <ReportRow label="Tổng chi phí" value={formatCurrencyVND(auditTotal.fee)} />
              <ReportRow label="Phí trung bình" value={auditTotal.orders > 0 ? formatCurrencyVND(auditTotal.fee / auditTotal.orders) : "0"} />
              <ReportRow label="Tổng tiền thu hộ" value={formatCurrencyVND(auditTotal.cod)} />
              <ReportRow label="Tỉ lệ phí/tiền thu hộ" value={auditTotal.cod > 0 ? `${((auditTotal.fee / auditTotal.cod) * 100).toFixed(1)}%` : "0"} />
            </div>
          </div>
        </section>

        {/* Success rate chart */}
        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-600 uppercase">Chỉ số giao hàng thành công</h3>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-6 mb-8 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Hiển thị theo:</span>
                <button
                  onClick={() => setView("day")}
                  className={`px-2 py-0.5 rounded ${view === "day" ? "bg-blue-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  Ngày
                </button>
                <button
                  onClick={() => setView("month")}
                  className={`px-2 py-0.5 rounded ${view === "month" ? "bg-blue-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  Tháng
                </button>
              </div>
              <div className="flex items-center gap-4 ml-auto">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-blue-300 rounded-full" />
                  <span>Giao hàng thành công</span>
                </div>
              </div>
            </div>
            <SuccessRateChart value={s?.delivery_success_rate ?? 0} />
          </div>
        </section>

        {/* Final stats row */}
        <section className="grid grid-cols-12 gap-6">
          <div className="col-span-9 bg-white border border-slate-200 rounded-lg p-12 flex flex-col items-center justify-center h-80">
            <EmptyChart message="Không có dữ liệu trả về" small />
          </div>
          <div className="col-span-3 bg-white border border-slate-200 rounded-lg p-6 flex flex-col">
            <select className="text-xs border-slate-200 rounded mb-6">
              <option>Tất cả đối tác</option>
            </select>
            <h4 className="text-sm font-semibold text-slate-700 mb-4">Thống kê chi tiết</h4>
            <div className="space-y-3 text-sm">
              <ReportRow label="Tổng vận đơn" value={auditTotal.orders} />
              <ReportRow label="Giao thành công" value={s?.delivered ?? 0} />
              <ReportRow label="Tỉ lệ giao thành công" value={`${s?.delivery_success_rate ?? 0}%`} />
            </div>
          </div>
        </section>
      </div>

      {/* Footer hint */}
      <footer className="p-8 text-center text-slate-500 text-sm">
        <div className="flex items-center justify-center gap-2">
          <div className="w-6 h-6 rounded-full border border-blue-400 text-blue-400 flex items-center justify-center font-bold">?</div>
          <span>
            Bạn có thể xem thêm hướng dẫn về tổng quan vận chuyển{" "}
            <Link href="#" className="text-blue-500 hover:underline">tại đây</Link>
          </span>
        </div>
      </footer>

      {/* Floating support */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        <button
          onClick={() => setShowShippingTip((v) => !v)}
          className="w-12 h-12 bg-[#0088FF] text-white rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition"
          title="Hỗ trợ nhanh"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  label,
  value,
  tip = false,
  small = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tip?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`border border-slate-100 rounded-lg ${small ? "p-3" : "p-4"} text-center hover:shadow-md transition-shadow cursor-pointer`}>
      <div className={`flex justify-center ${small ? "mb-1" : "mb-2"}`}>{icon}</div>
      <p className={`${small ? "text-xs" : "text-sm"} text-slate-600`}>
        {label} {tip && <Info className="w-3 h-3 inline text-blue-400" />}
      </p>
      <p className="text-blue-500 font-bold">{value} đơn</p>
      <p className="text-blue-500 font-bold">{value}</p>
    </div>
  );
}

function ReportRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function EmptyChart({ message, small = false }: { message: string; small?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center opacity-50 ${small ? "h-32" : "h-48"}`}>
      <svg className={`${small ? "w-16 h-16" : "w-24 h-24"} text-slate-300`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 3v18h18v-2H5V3H3zm14.5 11l-2.5-3-2 2.5-3-4-4 5h15l-3.5-4.5z" opacity="0.3" />
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
      </svg>
      <p className="text-xs mt-4 text-slate-400">{message}</p>
    </div>
  );
}

function SuccessRateChart({ value }: { value: number }) {
  const max = 100;
  const ratio = Math.min(1, Math.max(0, value / max));
  return (
    <div className="h-48 w-full relative">
      <div className="absolute left-0 top-0 text-[10px] text-slate-400">0%</div>
      <div className="absolute right-0 top-0 text-[10px] text-slate-400">{max}%</div>
      <div className="ml-12 h-32 border-b border-slate-100 relative flex items-end">
        <div
          className="w-full bg-gradient-to-t from-blue-300/40 to-blue-300/0 relative"
          style={{ height: `${Math.max(2, ratio * 100)}%` }}
        >
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-sm font-semibold text-blue-600">
            {value}%
          </div>
        </div>
      </div>
      <div className="ml-12 mt-4 flex justify-between text-[10px] text-slate-400">
        <span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>
      </div>
    </div>
  );
}
