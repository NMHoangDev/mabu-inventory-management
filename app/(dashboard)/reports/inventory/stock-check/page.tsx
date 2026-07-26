"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  DateRangePicker,
  fmtMoney,
  formatFullDate,
  getDateRange,
  Period,
  PeriodSelector,
  ReportShell,
  ReportTable,
  SummaryCard,
} from "@/invoice-flow-manager-fe/components/reports/ReportShell";
import { fetchStockCheck } from "@/services/reportService";
import { InventoryExportButton } from "@/components/reports/InventoryExportButton";

const STATUS_STYLE: Record<string, string> = {
  "Hoàn thành": "text-green-600 bg-green-50",
  completed: "text-green-600 bg-green-50",
  balanced: "text-green-600 bg-green-50",
  "Đang kiểm kê": "text-blue-600 bg-blue-50",
  in_progress: "text-blue-600 bg-blue-50",
  "Chưa duyệt": "text-amber-600 bg-amber-50",
  draft: "text-amber-600 bg-amber-50",
};

export default function StockCheckPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    checks: any[];
    total_checks: number;
    completed: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      const result = await fetchStockCheck(range);
      setData({ checks: result.checks, total_checks: result.summary.total_checks, completed: result.summary.completed });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const d = data;
  const range = period === "custom" && dateFrom && dateTo ? { from: dateFrom, to: dateTo } : getDateRange(period);

  return (
    <ReportShell
      title="Báo cáo kiểm kê hàng hóa"
      backHref="/reports/inventory"
      loading={loading}
      actions={<InventoryExportButton groupBy="stock_check" title="Xuất file báo cáo kiểm kê" dateFrom={range.from} dateTo={range.to} />}
    >
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex flex-col gap-2">
          <PeriodSelector value={period} onChange={(p) => { setPeriod(p); if (p !== "custom") load(); }} />
          {period === "custom" && (
            <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onApply={load} />
          )}
        </div>
        <button onClick={load} className="p-2 border border-gray-200 rounded hover:bg-gray-50">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {d ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard label="Số lần kiểm kê" value={String(d.total_checks)} sub="Lần" color="blue" />
            <SummaryCard label="Hoàn thành" value={String(d.completed)} sub="Lần" color="green" />
            <SummaryCard label="Đang kiểm kê" value={String(d.total_checks - d.completed)} sub="Lần" color="amber" />
            <SummaryCard label="Tỷ lệ hoàn thành" value={`${((d.completed / Math.max(d.total_checks, 1)) * 100).toFixed(0)}%`} sub="%" color="purple" />
          </div>

          <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Lịch sử kiểm kê</h3>
            </div>
            <ReportTable
              columns={[
                { key: "code", label: "Mã kiểm kê", align: "left" },
                { key: "created_at", label: "Ngày", align: "center", render: (v) => formatFullDate(String(v).slice(0, 10)) },
                { key: "branch", label: "Kho", align: "left" },
                { key: "staff", label: "Người kiểm", align: "left" },
                { key: "total_items", label: "Tổng mặt hàng", align: "right" },
                { key: "variance_items", label: "Chênh lệch", align: "right" },
                {
                  key: "status", label: "Trạng thái", align: "center",
                  render: (v) => {
                    const cls = STATUS_STYLE[String(v)] ?? "text-gray-600 bg-gray-50";
                    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{String(v)}</span>;
                  }
                },
              ]}
              data={d.checks}
            />
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
