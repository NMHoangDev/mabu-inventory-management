"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  HelpCircle,
  Loader2,
  MessageCircle,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";

type Period = "7d" | "30d" | "90d" | "this_month" | "last_month" | "this_quarter" | "custom";

interface DateRange {
  from: string;
  to: string;
}

function getDateRange(period: Period): DateRange {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  switch (period) {
    case "7d": {
      const f = new Date(now); f.setDate(f.getDate() - 6);
      return { from: f.toISOString().slice(0, 10), to: today };
    }
    case "30d": {
      const f = new Date(now); f.setDate(f.getDate() - 29);
      return { from: f.toISOString().slice(0, 10), to: today };
    }
    case "90d": {
      const f = new Date(now); f.setDate(f.getDate() - 89);
      return { from: f.toISOString().slice(0, 10), to: today };
    }
    case "this_month": {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: f.toISOString().slice(0, 10), to: today };
    }
    case "last_month": {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      const f = new Date(now.getFullYear(), q * 3, 1);
      return { from: f.toISOString().slice(0, 10), to: today };
    }
    default: {
      const f = new Date(now); f.setDate(f.getDate() - 6);
      return { from: f.toISOString().slice(0, 10), to: today };
    }
  }
}

interface ProfitLossData {
  revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
  expenses: number;
  net_profit: number;
  net_margin: number;
  order_count: number;
  avg_order_value: number;
  daily_data: DailyPoint[];
  by_payment_method: PaymentMethodBreakdown[];
  top_products: TopProduct[];
}

interface DailyPoint {
  date: string;
  revenue: number;
  cogs: number;
  expenses: number;
}

interface PaymentMethodBreakdown {
  method: string;
  amount: number;
  count: number;
}

interface TopProduct {
  product_name: string;
  quantity_sold: number;
  revenue: number;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function formatFullDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

async function fetchProfitLossData(dateRange: DateRange): Promise<ProfitLossData> {
  const params = new URLSearchParams({ date_from: dateRange.from, date_to: dateRange.to });
  const res = await fetch(`/api/reports/profit-loss?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Không tải được báo cáo lãi lỗ.");
  return res.json();
}

// So sánh với kỳ liền trước (cùng số ngày) để có % tăng/giảm THẬT — trước
// đây 3 badge "+12.5%"/"+5.2%"/"+8.3%" luôn hiển thị cố định bất kể dữ liệu.
function previousPeriod(range: DateRange): DateRange {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? null : 0;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  paid: "Đã thanh toán",
  partial: "Thanh toán một phần",
  unpaid: "Chưa thanh toán",
  refunded: "Hoàn tiền"
};

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 ngày gần đây",
  "30d": "30 ngày gần đây",
  "90d": "90 ngày gần đây",
  "this_month": "Tháng này",
  "last_month": "Tháng trước",
  "this_quarter": "Quý này",
  "custom": "Tùy chọn"
};

function MiniLineChart({ data, height = 60 }: { data: DailyPoint[]; height?: number }) {
  if (data.length === 0) {
    return <div className="h-full flex items-center justify-center text-gray-400 text-xs">Chưa có dữ liệu</div>;
  }
  const maxV = Math.max(...data.map((d) => d.revenue), 1);
  const w = 300;
  const h = height;
  const stepX = w / Math.max(data.length - 1, 1);
  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = h - (d.revenue / maxV) * (h - 4);
    return `${x},${y}`;
  }).join(" ");
  const fillPoints = `0,${h} ${points} ${(data.length - 1) * stepX},${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0088ff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0088ff" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill="url(#lineGrad)" />
      <polyline points={points} fill="none" stroke="#0088ff" strokeWidth="1.5" strokeLinejoin="round" />
      {data.map((d, i) => {
        const x = i * stepX;
        const y = h - (d.revenue / maxV) * (h - 4);
        return <circle key={i} cx={x} cy={y} r="2" fill="#0088ff" />;
      })}
    </svg>
  );
}

function AreaBarChart({ data }: { data: DailyPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Chưa có dữ liệu
      </div>
    );
  }
  const maxV = Math.max(...data.flatMap((d) => [d.revenue, d.cogs, d.expenses]), 1);
  const barW = Math.max(4, Math.min(24, Math.floor((600 - data.length * 2) / data.length)));
  const totalW = data.length * (barW + 2) + 40;

  return (
    <svg viewBox={`0 0 ${totalW} 160`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const x = i * (barW + 2) + 4;
        const revH = Math.max(2, (d.revenue / maxV) * 120);
        const cogsH = Math.max(2, (d.cogs / maxV) * 120);
        const expH = Math.max(2, (d.expenses / maxV) * 120);
        return (
          <g key={d.date}>
            <rect x={x} y={120 - revH} width={barW} height={revH} fill="#0088ff" opacity={0.8} rx="1" />
            <rect x={x + barW / 3} y={120 - cogsH} width={barW / 3} height={cogsH} fill="#f59e0b" opacity={0.8} rx="1" />
            <rect x={x + (barW * 2) / 3} y={120 - expH} width={barW / 3} height={expH} fill="#ef4444" opacity={0.8} rx="1" />
          </g>
        );
      })}
    </svg>
  );
}

export default function ProfitLossPage() {
  const [period, setPeriod] = useState<Period>("7d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [prevData, setPrevData] = useState<ProfitLossData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      const [result, prevResult] = await Promise.all([
        fetchProfitLossData(range),
        fetchProfitLossData(previousPeriod(range)).catch(() => null)
      ]);
      setData(result);
      setPrevData(prevResult);
    } catch {
      setData(null);
      setPrevData(null);
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const d = data;
  const grossMargin = d ? d.gross_margin : 0;
  const netMargin = d ? d.net_margin : 0;
  const revenueTrend = d && prevData ? pctChange(d.revenue, prevData.revenue) : null;
  const grossProfitTrend = d && prevData ? pctChange(d.gross_profit, prevData.gross_profit) : null;
  const netProfitTrend = d && prevData ? pctChange(d.net_profit, prevData.net_profit) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <a href="/reports/finance" className="text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-5 h-5" />
          </a>
          <h1 className="text-xl font-semibold text-slate-800">Báo cáo lãi lỗ</h1>
        </div>
        <button className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm border border-slate-300 rounded px-3 py-1.5 bg-white">
          <HelpCircle className="w-4 h-4" />
          Trợ giúp
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 bg-[#f4f6f8] space-y-6">
        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(PERIOD_LABELS) as Period[]).filter((p) => p !== "custom").map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                period === p
                  ? "bg-blue-500 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-blue-400"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <div className="flex items-center gap-1 ml-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPeriod("custom"); }}
              className="border border-slate-200 rounded px-2 py-1.5 text-sm"
            />
            <span className="text-slate-400 text-xs">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPeriod("custom"); }}
              className="border border-slate-200 rounded px-2 py-1.5 text-sm"
            />
            <button
              onClick={load}
              className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              Áp dụng
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : d ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <SummaryCard
                label="Doanh thu"
                value={formatCurrencyVND(d.revenue)}
                sub={`${d.order_count} đơn`}
                color="blue"
                trend={revenueTrend !== null ? `${revenueTrend >= 0 ? "+" : ""}${revenueTrend.toFixed(1)}%` : undefined}
                trendUp={revenueTrend !== null && revenueTrend >= 0}
              />
              <SummaryCard
                label="Giá vốn (COGS)"
                value={formatCurrencyVND(d.cogs)}
                sub={`${grossMargin.toFixed(1)}%`}
                color="amber"
              />
              <SummaryCard
                label="Lợi nhuận gộp"
                value={formatCurrencyVND(d.gross_profit)}
                sub={`${grossMargin.toFixed(1)}% margin`}
                color="green"
                trend={grossProfitTrend !== null ? `${grossProfitTrend >= 0 ? "+" : ""}${grossProfitTrend.toFixed(1)}%` : undefined}
                trendUp={grossProfitTrend !== null && grossProfitTrend >= 0}
              />
              <SummaryCard
                label="Chi phí"
                value={formatCurrencyVND(d.expenses)}
                sub={`${((d.expenses / Math.max(d.revenue, 1)) * 100).toFixed(1)}% doanh thu`}
                color="red"
              />
              <SummaryCard
                label="Lợi nhuận ròng"
                value={formatCurrencyVND(d.net_profit)}
                sub={`${netMargin.toFixed(1)}% margin`}
                color={d.net_profit >= 0 ? "green" : "red"}
                trend={netProfitTrend !== null ? `${netProfitTrend >= 0 ? "+" : ""}${netProfitTrend.toFixed(1)}%` : undefined}
                trendUp={netProfitTrend !== null && netProfitTrend >= 0}
              />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue trend */}
              <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm">Xu hướng doanh thu</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {d.daily_data.length > 0
                        ? `${formatFullDate(d.daily_data[0].date)} — ${formatFullDate(d.daily_data[d.daily_data.length - 1].date)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-medium text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-6 h-1.5 bg-blue-500 block rounded-sm"></span> Doanh thu
                    </span>
                  </div>
                </div>
                <div className="h-36">
                  <MiniLineChart data={d.daily_data} height={140} />
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-slate-400">
                  {d.daily_data.slice(0, 5).map((pt) => (
                    <span key={pt.date}>{formatDate(pt.date)}</span>
                  ))}
                </div>
              </div>

              {/* Revenue / COGS / Expenses */}
              <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm">Doanh thu / Giá vốn / Chi phí</h3>
                    <p className="text-xs text-slate-500 mt-0.5">So sánh theo ngày</p>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-medium text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-2 bg-blue-500 block rounded-sm"></span> DT
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-2 bg-amber-500 block rounded-sm"></span> GV
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-2 bg-red-500 block rounded-sm"></span> CP
                    </span>
                  </div>
                </div>
                <div className="h-36 overflow-x-auto">
                  <AreaBarChart data={d.daily_data} />
                </div>
              </div>
            </div>

            {/* Metrics + Top Products */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* By payment method */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-800 text-sm">Theo hình thức thanh toán</h3>
                </div>
                <div className="p-5 space-y-3">
                  {d.by_payment_method.length === 0 ? (
                    <p className="text-sm text-slate-400">Chưa có dữ liệu</p>
                  ) : (
                    d.by_payment_method.map((pm) => {
                      const pct = d.revenue > 0 ? (pm.amount / d.revenue) * 100 : 0;
                      return (
                        <div key={pm.method}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-700">{PAYMENT_METHOD_LABELS[pm.method] ?? pm.method}</span>
                            <span className="font-medium tabular-nums">{formatCurrencyVND(pm.amount)}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded overflow-hidden">
                            <div className="h-full bg-blue-500 rounded" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">{pct.toFixed(1)}% · {pm.count} đơn</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Top products */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-800 text-sm">Top sản phẩm bán chạy</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 uppercase border-b border-slate-100">
                        <th className="px-5 py-3 text-left font-medium">Sản phẩm</th>
                        <th className="px-5 py-3 text-right font-medium">SL bán</th>
                        <th className="px-5 py-3 text-right font-medium">Doanh thu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {d.top_products.map((p, i) => (
                        <tr key={p.product_name} className="hover:bg-slate-50">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                i === 0 ? "bg-yellow-400 text-white" :
                                i === 1 ? "bg-slate-300 text-white" :
                                i === 2 ? "bg-amber-600 text-white" :
                                "bg-slate-100 text-slate-500"
                              }`}>
                                {i + 1}
                              </span>
                              <span className="text-slate-700 font-medium">{p.product_name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-600">{p.quantity_sold}</td>
                          <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-800">{formatCurrencyVND(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Avg order value */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg border border-slate-200 p-5 text-center shadow-sm">
                <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Giá trị TB đơn hàng</div>
                <div className="text-2xl font-bold text-slate-800">{formatCurrencyVND(d.avg_order_value)}</div>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-5 text-center shadow-sm">
                <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Số đơn hàng</div>
                <div className="text-2xl font-bold text-slate-800">{d.order_count}</div>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-5 text-center shadow-sm">
                <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Tỷ suất lợi nhuận ròng</div>
                <div className={`text-2xl font-bold ${d.net_profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {netMargin.toFixed(1)}%
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24">
            <p className="text-slate-500">Chưa có dữ liệu trong khoảng thời gian này.</p>
          </div>
        )}
      </div>

      <div className="flex justify-center px-6 py-5 flex-shrink-0">
        <div className="bg-blue-50 border border-blue-100 rounded-full px-6 py-3 flex items-center gap-3">
          <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-slate-600">
            Bạn có thể xem thêm hướng dẫn về theo dõi báo cáo{" "}
            <a className="text-blue-600 hover:underline" href="#">tại đây</a>
          </p>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 z-20">
        <button className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-700 transition-colors">
          <MessageCircle className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function SummaryCard({
  label, value, sub, color, trend, trendUp
}: {
  label: string;
  value: string;
  sub: string;
  color: "blue" | "green" | "amber" | "red";
  trend?: string;
  trendUp?: boolean;
}) {
  const colorMap = {
    blue: "text-blue-600 border-blue-100 bg-blue-50",
    green: "text-green-600 border-green-100 bg-green-50",
    amber: "text-amber-600 border-amber-100 bg-amber-50",
    red: "text-red-600 border-red-100 bg-red-50"
  };
  const iconColor = { blue: "#0088ff", green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };

  return (
    <div className={`rounded-lg border p-4 bg-white shadow-sm ${colorMap[color].split(" ")[1]}`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${colorMap[color].split(" ")[0]}`}>{value}</div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-slate-400">{sub}</span>
        {trend && (
          <span className={`text-[10px] font-medium flex items-center gap-0.5 ${trendUp ? "text-green-600" : "text-red-500"}`}>
            {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
