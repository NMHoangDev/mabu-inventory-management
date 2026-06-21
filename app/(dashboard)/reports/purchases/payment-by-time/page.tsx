"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw, Table2 } from "lucide-react";
import {
  DateRangePicker,
  fmtMoney,
  formatDate,
  getDateRange,
  Period,
  PeriodSelector,
  ReportShell,
  SvgBarChart,
  SvgLineChart,
  SummaryCard,
} from "@/components/reports/ReportShell";
import { fetchPaymentByTime } from "@/services/reportService";

export default function PaymentByTimePage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    daily: { day: string; total_paid: number; total_unpaid: number }[];
    summary: { total_amount: number; total_paid: number; total_unpaid: number };
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      const result = await fetchPaymentByTime(range);
      setData({ daily: result.daily, summary: result.summary });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const d = data;

  return (
    <ReportShell
      title="Báo cáo thanh toán nhập hàng theo thời gian"
      backHref="/reports/purchases"
      loading={loading}
    >
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex flex-col gap-2">
          <PeriodSelector value={period} onChange={(p) => { setPeriod(p); if (p !== "custom") load(); }} />
          {period === "custom" && (
            <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onApply={load} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-gray-200 rounded overflow-hidden">
            <button onClick={() => setView("chart")} className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${view === "chart" ? "bg-blue-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              <BarChart3 className="w-3.5 h-3.5" /> Biểu đồ
            </button>
            <button onClick={() => setView("table")} className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${view === "table" ? "bg-blue-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              <Table2 className="w-3.5 h-3.5" /> Bảng
            </button>
          </div>
          <button onClick={load} className="p-2 border border-gray-200 rounded hover:bg-gray-50">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {d ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard label="Tổng giá trị" value={fmtMoney.format(d.summary.total_amount)} sub="VNĐ" color="blue" />
            <SummaryCard label="Đã thanh toán" value={fmtMoney.format(d.summary.total_paid)} sub={`${((d.summary.total_paid / Math.max(d.summary.total_amount, 1)) * 100).toFixed(1)}%`} color="green" />
            <SummaryCard label="Chưa thanh toán" value={fmtMoney.format(d.summary.total_unpaid)} sub={`${((d.summary.total_unpaid / Math.max(d.summary.total_amount, 1)) * 100).toFixed(1)}%`} color="red" />
            <SummaryCard label="Số giao dịch" value={String(d.daily.length)} sub="Ngày" color="amber" />
          </div>

          {view === "chart" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-800 text-sm mb-4">Thanh toán theo ngày</h3>
                <SvgBarChart
                  labels={d.daily.map((pt) => formatDate(pt.day))}
                  datasets={[
                    { label: "Đã thanh toán", data: d.daily.map((pt) => pt.total_paid), color: "#22c55e" },
                    { label: "Chưa thanh toán", data: d.daily.map((pt) => pt.total_unpaid), color: "#ef4444" },
                  ]}
                  height={180}
                />
              </div>
              <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-800 text-sm mb-4">Xu hướng thanh toán</h3>
                <SvgLineChart
                  labels={d.daily.map((pt) => formatDate(pt.day))}
                  datasets={[
                    { label: "Đã thanh toán", data: d.daily.map((pt) => pt.total_paid), color: "#22c55e" },
                    { label: "Còn nợ", data: d.daily.map((pt) => pt.total_unpaid), color: "#ef4444" },
                  ]}
                  height={180}
                />
              </div>
            </div>
          )}
        </>
      ) : null}
    </ReportShell>
  );
}
