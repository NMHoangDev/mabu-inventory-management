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
} from "@/components/reports/ReportShell";
import { fetchPaymentByStaff } from "@/services/reportService";

export default function PaymentByStaffPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    staff: { name: string; role: string; order_count: number; total: number; paid: number; unpaid: number }[];
    summary: { total_amount: number; total_paid: number; total_unpaid: number };
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      const result = await fetchPaymentByStaff(range);
      setData({ staff: result.staff, summary: result.summary });
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
      title="Báo cáo thanh toán nhập hàng theo nhân viên"
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
            <SummaryCard label="Tổng nhân viên" value={String(d.staff.length)} sub="Người" color="blue" />
            <SummaryCard label="Tổng chi" value={fmtMoney.format(d.summary.total_amount)} sub="VNĐ" color="green" />
            <SummaryCard label="Đã thanh toán" value={fmtMoney.format(d.summary.total_paid)} sub="VNĐ" color="purple" />
            <SummaryCard label="Còn nợ" value={fmtMoney.format(d.summary.total_unpaid)} sub="VNĐ" color="red" />
          </div>

          {view === "chart" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-800 text-sm mb-4">Chi theo nhân viên</h3>
                <DonutChart
                  data={d.staff.map((s, i) => ({
                    label: s.name,
                    value: s.total,
                    color: ["#0088ff", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"][i % 5],
                  }))}
                />
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Chi tiết theo nhân viên</h3>
            </div>
            <ReportTable
              columns={[
                { key: "name", label: "Nhân viên", align: "left" },
                { key: "role", label: "Vai trò", align: "left" },
                { key: "order_count", label: "Số đơn", align: "right" },
                { key: "total", label: "Tổng chi", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                { key: "paid", label: "Đã thanh toán", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                { key: "unpaid", label: "Còn nợ", align: "right", render: (v) => fmtMoney.format(Number(v)) },
              ]}
              data={d.staff}
            />
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
