"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw, Table2 } from "lucide-react";
import {
  DateRangePicker,
  DonutChart,
  fmtMoney,
  formatDate,
  getDateRange,
  Period,
  PeriodSelector,
  ReportShell,
  ReportTable,
  SvgLineChart,
  SummaryCard,
} from "@/invoice-flow-manager-fe/components/reports/ReportShell";
import { fetchPaymentByMethod } from "@/services/reportService";
import { formatCurrencyVND } from "@/lib/shared/format";

export default function PaymentByMethodPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    methods: { method: string; payment_count: number; total_paid: number }[];
    summary: { total_amount: number; total_paid: number };
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      const result = await fetchPaymentByMethod(range);
      setData({ methods: result.methods, summary: result.summary });
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
      title="Báo cáo thanh toán nhập hàng theo phương thức"
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
            <SummaryCard label="Tổng giá trị" value={formatCurrencyVND(d.summary.total_amount)} color="blue" />
            <SummaryCard label="Đã thanh toán" value={formatCurrencyVND(d.summary.total_paid)} color="green" />
            <SummaryCard label="Số giao dịch" value={fmtMoney.format(d.methods.reduce((s, m) => s + m.payment_count, 0))} sub="Lần" color="purple" />
            <SummaryCard label="TB / giao dịch" value={formatCurrencyVND(d.summary.total_paid / Math.max(d.methods.reduce((s, m) => s + m.payment_count, 0), 1))} color="amber" />
          </div>

          {view === "chart" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-800 text-sm mb-4">Tỷ trọng theo phương thức</h3>
                <DonutChart
                  data={d.methods.map((m, i) => ({
                    label: m.method,
                    value: m.total_paid,
                    color: ["#0088ff", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"][i % 5],
                  }))}
                  formatValue={formatCurrencyVND}
                />
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Chi tiết theo phương thức thanh toán</h3>
            </div>
            <ReportTable
              columns={[
                { key: "method", label: "Phương thức", align: "left" },
                { key: "payment_count", label: "Số giao dịch", align: "right" },
                { key: "total_paid", label: "Tổng giá trị", align: "right", render: (v) => formatCurrencyVND(Number(v)) },
                {
                  key: "total_paid", label: "Tỷ trọng", align: "right",
                  render: (v) => `${((Number(v) / Math.max(d?.summary.total_amount ?? 1, 1)) * 100).toFixed(1)}%`
                },
              ]}
              data={d.methods}
            />
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
