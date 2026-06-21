"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw, Table2 } from "lucide-react";
import {
  DateRangePicker,
  DonutChart,
  fmtMoney,
  formatFullDate,
  getDateRange,
  Period,
  PeriodSelector,
  ReportShell,
  ReportTable,
  SvgLineChart,
  SummaryCard,
} from "@/components/reports/ReportShell";
import { fetchPurchaseBySupplier, type SupplierPurchaseData } from "@/services/reportService";

export default function BySupplierPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    suppliers: SupplierPurchaseData[];
    daily: { day: string; total_amount: number }[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      const result = await fetchPurchaseBySupplier(range);
      setData({ suppliers: result.suppliers, daily: result.daily });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const d = data;
  const cur = d?.suppliers[selected];
  const totalAmount = d?.suppliers.reduce((s, sup) => s + sup.total_amount, 0) ?? 0;
  const totalPaid = d?.suppliers.reduce((s, sup) => s + sup.total_paid, 0) ?? 0;

  return (
    <ReportShell
      title="Báo cáo nhập hàng theo nhà cung cấp"
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {d.suppliers.map((s, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`rounded-lg border p-3 text-left transition-all ${selected === i ? "border-blue-500 bg-blue-50 shadow-sm" : "border-gray-100 bg-white hover:border-blue-300"}`}
              >
                <div className="text-xs text-gray-500 truncate">{s.supplier_name}</div>
                <div className={`text-sm font-bold mt-0.5 ${selected === i ? "text-blue-600" : "text-gray-800"}`}>
                  {fmtMoney.format(s.total_amount)}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">{s.receipt_count} đơn</div>
              </button>
            ))}
          </div>

          {view === "chart" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {cur && (
                <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                  <h3 className="font-semibold text-gray-800 text-sm mb-1">{cur.supplier_name}</h3>
                  <div className="space-y-3 mt-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Tổng giá trị</span>
                      <span className="font-semibold text-gray-800">{fmtMoney.format(cur.total_amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Đã thanh toán</span>
                      <span className="font-semibold text-green-600">{fmtMoney.format(cur.total_paid)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Còn nợ</span>
                      <span className="font-semibold text-red-500">{fmtMoney.format(cur.unpaid)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-green-500 rounded" style={{ width: `${(cur.total_paid / Math.max(cur.total_amount, 1)) * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400">Thanh toán: {((cur.total_paid / Math.max(cur.total_amount, 1)) * 100).toFixed(1)}%</p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-800 text-sm mb-4">Tỷ trọng theo nhà cung cấp</h3>
                <DonutChart
                  data={d.suppliers.map((s, i) => ({
                    label: s.supplier_name,
                    value: s.total_amount,
                    color: ["#0088ff", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"][i % 5],
                  }))}
                />
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800 text-sm">Danh sách nhà cung cấp</h3>
              </div>
              <ReportTable
                columns={[
                  { key: "supplier_name", label: "Nhà cung cấp", align: "left" },
                  { key: "receipt_count", label: "Số đơn", align: "right" },
                  { key: "total_amount", label: "Tổng tiền", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                  { key: "total_paid", label: "Đã thanh toán", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                  { key: "unpaid", label: "Còn nợ", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                ]}
                data={d.suppliers}
              />
            </div>
          )}
        </>
      ) : null}
    </ReportShell>
  );
}
