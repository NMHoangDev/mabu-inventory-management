"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw, Table2 } from "lucide-react";
import {
  DateRangePicker,
  fmtMoney,
  getDateRange,
  Period,
  PeriodSelector,
  ReportShell,
  ReportTable,
  SvgBarChart,
  SummaryCard,
} from "@/invoice-flow-manager-fe/components/reports/ReportShell";
import { fetchBelowThreshold } from "@/services/reportService";
import { InventoryExportButton } from "@/components/reports/InventoryExportButton";

const URGENT_STYLE: Record<string, string> = {
  "Khẩn cấp": "text-red-500 bg-red-50",
  "Bình thường": "text-amber-600 bg-amber-50",
};

export default function BelowThresholdPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<"chart" | "table">("table");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    items: any[];
    total_shortage: number;
    total_count: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      const result = await fetchBelowThreshold(range);
      setData({ items: result.items, total_shortage: result.summary.total_shortage, total_count: result.summary.total_count });
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
      title="Báo cáo tồn kho dưới định mức"
      backHref="/reports/inventory"
      loading={loading}
      actions={<InventoryExportButton groupBy="below_threshold" title="Xuất file báo cáo dưới định mức" />}
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
            <SummaryCard label="Sản phẩm dưới định mức" value={String(d.total_count)} sub="Loại" color="amber" />
            <SummaryCard label="Tổng thiếu hụt" value={fmtMoney.format(d.total_shortage)} sub="Sản phẩm" color="red" />
            <SummaryCard label="Cần đặt hàng" value={String(d.total_count)} sub="Sản phẩm" color="blue" />
            <SummaryCard label="TB thiếu/SP" value={fmtMoney.format(d.total_shortage / Math.max(d.total_count, 1))} sub="Sản phẩm" color="purple" />
          </div>

          {view === "chart" && (
            <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm mb-6">
              <h3 className="font-semibold text-gray-800 text-sm mb-4">Mức độ thiếu hụt</h3>
              <SvgBarChart
                labels={d.items.slice(0, 10).map((i) => i.sku)}
                datasets={[
                  { label: "Tồn hiện tại", data: d.items.slice(0, 10).map((i) => i.current_qty), color: "#f59e0b" },
                  { label: "Tồn tối thiểu", data: d.items.slice(0, 10).map((i) => i.min_stock), color: "#ef4444" },
                ]}
                height={200}
              />
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Danh sách sản phẩm dưới định mức</h3>
            </div>
            <ReportTable
              columns={[
                { key: "product_name", label: "Sản phẩm", align: "left" },
                { key: "sku", label: "SKU", align: "center" },
                { key: "category_name", label: "Danh mục", align: "left" },
                { key: "branch", label: "Kho", align: "left" },
                { key: "current_qty", label: "Tồn hiện tại", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                { key: "min_stock", label: "Tồn tối thiểu", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                { key: "shortage", label: "Thiếu", align: "right", render: (v) => fmtMoney.format(Number(v)) },
              ]}
              data={d.items.sort((a, b) => b.shortage - a.shortage)}
            />
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
