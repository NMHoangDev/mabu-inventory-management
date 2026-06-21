"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart2,
  ChevronDown,
  HelpCircle,
  Loader2,
  MessageCircle,
  Package,
  Plus,
  ShoppingCart,
  Truck,
  Undo2
} from "lucide-react";

const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

const SOURCE_LABELS: Record<string, string> = {
  store: "Tại quầy",
  facebook: "Facebook",
  website: "Website",
  zalo: "Zalo",
  other: "Khác"
};

const FULFILLMENT_LABELS: Record<string, string> = {
  unshipped: "Chưa giao",
  shipping: "Đang giao",
  shipped: "Đã giao",
  returned: "Trả hàng"
};

interface OrderSummary {
  id: string;
  code: string;
  customer_name: string;
  total: number;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  source: string;
  branch: string;
  staff: string;
  created_at: string;
}

interface DashboardStats {
  revenue_7d: number;
  orders_7d: number;
  avg_order_7d: number;
  returns_7d: number;
  delivery_7d: number;
  payments_7d: number;
}

interface DailyData {
  date: string;
  revenue: number;
  orders: number;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function getLast7Days(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  };
}

export default function SalesReportPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    revenue_7d: 0, orders_7d: 0, avg_order_7d: 0,
    returns_7d: 0, delivery_7d: 0, payments_7d: 0
  });
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [reportType, setReportType] = useState("revenue");
  const [deliveryReportType, setDeliveryReportType] = useState("status");
  const [dateRange] = useState(getLast7Days);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date_from: dateRange.from,
        date_to: dateRange.to,
        page: "1",
        page_size: "7"
      });
      const res = await fetch(`/api/orders?${params}`);
      const data = await res.json();

      const orders: OrderSummary[] = (data.orders ?? []).map((o: any) => ({
        id: o.id,
        code: o.code,
        customer_name: o.customer_name,
        total: o.total,
        status: o.status,
        payment_status: o.payment_status,
        fulfillment_status: o.fulfillment_status,
        source: o.source,
        branch: o.branch,
        staff: o.staff,
        created_at: o.created_at
      }));
      setRecentOrders(orders);

      const revenue = orders.reduce((s, o) => s + (o.total ?? 0), 0);
      const returns = orders.filter((o) => o.status === "cancelled").length;
      const delivery = orders.filter((o) => o.fulfillment_status !== "unshipped" && o.status !== "cancelled").length;

      setStats({
        revenue_7d: revenue,
        orders_7d: orders.length,
        avg_order_7d: orders.length > 0 ? Math.round(revenue / orders.length) : 0,
        returns_7d: returns,
        delivery_7d: delivery,
        payments_7d: 0
      });

      const byDate = new Map<string, DailyData>();
      for (const o of orders) {
        const d = o.created_at.slice(0, 10);
        if (!byDate.has(d)) byDate.set(d, { date: d, revenue: 0, orders: 0 });
        const entry = byDate.get(d)!;
        entry.revenue += o.total ?? 0;
        entry.orders += 1;
      }
      setDailyData(Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)));

    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const maxRevenue = Math.max(...dailyData.map((d) => d.revenue), 1);

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      {/* Top Header */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
        <h1 className="text-xl font-semibold text-slate-800">Báo cáo bán hàng</h1>
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <button className="flex items-center gap-1.5 hover:text-blue-600">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Tư vấn thuế
          </button>
          <button className="flex items-center gap-1.5 hover:text-blue-600">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Trợ giúp
          </button>
          <div className="flex items-center gap-2 border-l pl-4">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">N</div>
            <span className="text-sm font-medium">NA</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 bg-[#f0f2f5]">
        {/* Action bar */}
        <div className="flex justify-end mb-6">
          <button className="bg-[#0088ff] text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 shadow-sm hover:bg-blue-600 transition-colors">
            <Plus className="w-4 h-4" />
            Thêm báo cáo
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            {/* Upper grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Revenue Card */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 flex flex-col shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide">Doanh thu cửa hàng</h3>
                    <p className="text-gray-400 text-xs mt-0.5">7 ngày qua</p>
                  </div>
                  <span className="text-3xl font-bold text-[#0088ff]">{fmtMoney.format(stats.revenue_7d)}</span>
                </div>

                <div className="flex items-center gap-1 text-[#0088ff] text-xs font-medium mb-4 cursor-pointer">
                  Theo ngày giao hàng
                  <ChevronDown className="w-3 h-3" />
                </div>

                {/* Chart */}
                <div className="h-48 flex items-end justify-between px-4 pb-8 relative border-b border-gray-100">
                  <span className="absolute left-0 bottom-10 text-[10px] text-gray-400">0</span>
                  {dailyData.length > 0 ? (
                    <>
                      <div className="absolute bottom-12 left-4 right-4 h-px bg-gray-100" />
                      <div className="absolute inset-4">
                        <svg viewBox={`0 0 ${dailyData.length * 80} 120`} className="w-full h-full" preserveAspectRatio="none">
                          {dailyData.map((d, i) => {
                            const barH = Math.max(4, (d.revenue / maxRevenue) * 100);
                            const x = i * 80 + 10;
                            const y = 120 - barH;
                            return (
                              <g key={d.date}>
                                <rect
                                  x={x} y={y} width={40} height={barH}
                                  rx={3} fill="#0088ff" opacity={0.2 + (i / dailyData.length) * 0.6}
                                />
                                <rect
                                  x={x + 20} y={y} width={20} height={barH}
                                  rx={2} fill="#0088ff"
                                />
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 flex justify-between px-4 text-[10px] text-gray-500">
                        {dailyData.map((d) => (
                          <span key={d.date}>{formatDate(d.date)}</span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center w-full text-gray-400 text-sm">
                      Chưa có dữ liệu
                    </div>
                  )}
                </div>

                <div className="flex justify-center gap-8 mt-4 text-[10px] font-medium text-gray-500 uppercase">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-2 bg-blue-400 block rounded-sm"></span> Doanh thu
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-2 bg-green-500 block rounded-sm"></span> Lợi nhuận
                  </div>
                </div>

                <div className="mt-6">
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    className="w-full border border-gray-200 rounded-md text-sm text-gray-500 focus:ring-blue-500 focus:border-blue-500 py-1.5 px-3"
                  >
                    <option value="revenue">Theo doanh thu</option>
                    <option value="orders">Theo số đơn</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 mt-4 text-[10px] text-gray-400">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span> Gợi ý
                </div>
              </div>

              {/* Delivery Info Card */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 flex flex-col shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide">Thông tin giao hàng</h3>
                    <p className="text-gray-400 text-xs mt-0.5">7 ngày qua</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[#0088ff] text-xs font-medium mb-4 cursor-pointer">
                  Theo tình trạng
                  <ChevronDown className="w-3 h-3" />
                </div>

                <div className="flex-1 flex flex-col items-center justify-center py-4">
                  {stats.delivery_7d > 0 ? (
                    <div className="text-center">
                      <div className="text-4xl font-bold text-[#0088ff]">{stats.delivery_7d}</div>
                      <p className="text-xs text-gray-400 mt-1">đơn đang giao / đã giao</p>
                    </div>
                  ) : (
                    <>
                      <div className="w-40 h-40 flex items-center justify-center">
                        <svg viewBox="0 0 120 120" className="w-full h-full opacity-30">
                          <circle cx="60" cy="60" r="50" fill="none" stroke="#d1d5db" strokeWidth="2" />
                          <circle cx="60" cy="60" r="35" fill="none" stroke="#d1d5db" strokeWidth="2" strokeDasharray="4 4" />
                          <path d="M45 60 L55 70 L75 50" fill="none" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <p className="text-gray-400 text-xs italic mt-2">Chưa có dữ liệu báo cáo</p>
                    </>
                  )}
                </div>

                <div className="mt-6">
                  <select
                    value={deliveryReportType}
                    onChange={(e) => setDeliveryReportType(e.target.value)}
                    className="w-full border border-gray-200 rounded-md text-sm text-gray-500 focus:ring-blue-500 focus:border-blue-500 py-1.5 px-3"
                  >
                    <option value="status">Theo tình trạng</option>
                    <option value="carrier">Theo đơn vị vận chuyển</option>
                    <option value="branch">Theo chi nhánh</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 mt-4 text-[10px] text-gray-400">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span> Gợi ý
                </div>
              </div>
            </div>

            {/* Lower grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {/* Returns Card */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4">
                  <div>
                    <h3 className="text-gray-800 font-semibold text-sm uppercase tracking-wide">Trả hàng</h3>
                    <p className="text-gray-400 text-xs mt-0.5">7 ngày qua</p>
                  </div>
                  <span className="text-2xl font-bold text-[#0088ff]">{stats.returns_7d}</span>
                </div>
                <ul className="space-y-4">
                  <li className="flex items-center gap-3 text-xs text-gray-600 hover:text-[#0088ff] cursor-pointer group">
                    <Undo2 className="w-4 h-4 text-gray-400 group-hover:text-[#0088ff]" />
                    Trả hàng theo đơn hàng
                  </li>
                  <li className="flex items-center gap-3 text-xs text-gray-600 hover:text-[#0088ff] cursor-pointer group">
                    <Package className="w-4 h-4 text-gray-400 group-hover:text-[#0088ff]" />
                    Trả hàng theo sản phẩm
                  </li>
                </ul>
              </div>

              {/* Payments Card */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4">
                  <div>
                    <h3 className="text-gray-800 font-semibold text-sm uppercase tracking-wide">Thanh toán</h3>
                    <p className="text-gray-400 text-xs mt-0.5">7 ngày qua</p>
                  </div>
                  <span className="text-2xl font-bold text-[#0088ff]">{stats.payments_7d}</span>
                </div>
                <ul className="space-y-4">
                  <li className="flex items-center gap-3 text-xs text-gray-600 hover:text-[#0088ff] cursor-pointer group">
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-[#0088ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Báo cáo thanh toán theo thời gian
                  </li>
                  <li className="flex items-center gap-3 text-xs text-gray-600 hover:text-[#0088ff] cursor-pointer group">
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-[#0088ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    Báo cáo thanh toán theo nhân viên
                  </li>
                  <li className="flex items-center gap-3 text-xs text-gray-600 hover:text-[#0088ff] cursor-pointer group">
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-[#0088ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Báo cáo theo phương thức thanh toán
                  </li>
                  <li className="flex items-center gap-3 text-xs text-gray-600 hover:text-[#0088ff] cursor-pointer group">
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-[#0088ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    Báo cáo thanh toán theo chi nhánh
                  </li>
                </ul>
              </div>

              {/* Orders Card */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4">
                  <div>
                    <h3 className="text-gray-800 font-semibold text-sm uppercase tracking-wide">Đơn hàng</h3>
                    <p className="text-gray-400 text-xs mt-0.5">7 ngày qua</p>
                  </div>
                  <span className="text-2xl font-bold text-[#0088ff]">{stats.orders_7d}</span>
                </div>
                <ul className="space-y-4">
                  <li className="flex items-center gap-3 text-xs text-gray-600 hover:text-[#0088ff] cursor-pointer group">
                    <ShoppingCart className="w-4 h-4 text-gray-400 group-hover:text-[#0088ff]" />
                    <div className="flex items-center gap-2">
                      <span>Báo cáo thống kê theo đơn hàng</span>
                      <span className="bg-red-500 text-white text-[8px] px-1 rounded font-bold uppercase py-0.5">New</span>
                    </div>
                  </li>
                  <li className="flex items-center gap-3 text-xs text-gray-600 hover:text-[#0088ff] cursor-pointer group">
                    <Package className="w-4 h-4 text-gray-400 group-hover:text-[#0088ff]" />
                    Báo cáo thống kê theo sản phẩm
                  </li>
                  <li className="flex items-center gap-3 text-xs text-gray-600 hover:text-[#0088ff] cursor-pointer group">
                    <BarChart2 className="w-4 h-4 text-gray-400 group-hover:text-[#0088ff]" />
                    Báo cáo bán hàng chi tiết
                  </li>
                </ul>
              </div>
            </div>

            {/* Recent Orders Table */}
            {recentOrders.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-8">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-sm text-gray-800">Đơn hàng gần đây (7 ngày)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Mã đơn</th>
                        <th className="px-4 py-3 text-left">Khách hàng</th>
                        <th className="px-4 py-3 text-left">Nguồn</th>
                        <th className="px-4 py-3 text-left">Giao hàng</th>
                        <th className="px-4 py-3 text-right">Tổng tiền</th>
                        <th className="px-4 py-3 text-left">Ngày tạo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recentOrders.slice(0, 5).map((o) => (
                        <tr key={o.id} className="hover:bg-blue-50 transition-colors">
                          <td className="px-4 py-3 text-blue-600 font-medium">{o.code}</td>
                          <td className="px-4 py-3 text-gray-700">{o.customer_name || "Khách lẻ"}</td>
                          <td className="px-4 py-3 text-gray-500">{SOURCE_LABELS[o.source] ?? o.source}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              o.fulfillment_status === "shipped"
                                ? "bg-green-100 text-green-700"
                                : o.fulfillment_status === "shipping"
                                ? "bg-blue-100 text-blue-700"
                                : o.fulfillment_status === "returned"
                                ? "bg-red-50 text-red-600"
                                : "bg-gray-100 text-gray-600"
                            }`}>
                              {FULFILLMENT_LABELS[o.fulfillment_status] ?? o.fulfillment_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtMoney.format(o.total)} đ</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(o.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Custom Reports */}
            <div className="flex items-center justify-between mt-12 pb-8">
              <h2 className="text-sm font-semibold text-slate-700">Báo cáo tùy chỉnh</h2>
              <button className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer hover:text-blue-600">
                Tất cả
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </>
        )}

        {/* Help Alert */}
        <div className="flex justify-center mt-4">
          <div className="bg-blue-50 border border-blue-100 rounded-full px-6 py-3 flex items-center gap-3 shadow-sm">
            <div className="bg-teal-500 text-white rounded-full p-1">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs text-gray-700">
              Bạn có thể xem thêm hướng dẫn về theo dõi báo cáo{" "}
              <a className="text-[#0088ff] font-medium underline" href="#">Tại đây</a>
            </p>
          </div>
        </div>
      </div>

      {/* Floating chat */}
      <div className="fixed bottom-6 right-6 z-50">
        <button className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg cursor-pointer hover:bg-blue-600 transition-colors">
          <MessageCircle className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
