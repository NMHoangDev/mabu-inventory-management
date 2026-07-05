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
import { fetchInventoryLedger } from "@/services/reportService";

const TYPE_STYLE: Record<string, string> = {
  "Nhập kho": "text-green-600 bg-green-50",
  "Xuất kho": "text-red-500 bg-red-50",
  import: "text-green-600 bg-green-50",
  export: "text-red-500 bg-red-50",
};

export default function StockLedgerPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    entries: any[];
    total_import: number;
    total_export: number;
    total_count: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      const result = await fetchInventoryLedger(range);
      setData({ entries: result.entries, total_import: result.summary.total_import, total_export: result.summary.total_export, total_count: result.summary.total_count });
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
      title="Sổ kho"
      description="Lịch sử giao dịch xuất nhập kho"
      backHref="/reports/inventory"
      loading={loading}
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
            <SummaryCard label="Tổng nhập" value={fmtMoney.format(d.total_import)} sub="Sản phẩm" color="green" />
            <SummaryCard label="Tổng xuất" value={fmtMoney.format(d.total_export)} sub="Sản phẩm" color="red" />
            <SummaryCard label="Chênh lệch" value={fmtMoney.format(Math.abs(d.total_import - d.total_export))} sub="Sản phẩm" color="amber" />
            <SummaryCard label="Tổng giao dịch" value={String(d.total_count)} sub="Lần" color="blue" />
          </div>

          <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Nhật ký kho</h3>
            </div>
            <ReportTable
              columns={[
                { key: "date", label: "Ngày", align: "center", render: (v) => formatFullDate(String(v).slice(0, 10)) },
                { key: "reference", label: "Số phiếu", align: "left" },
                { key: "product_name", label: "Sản phẩm", align: "left" },
                { key: "sku", label: "SKU", align: "center" },
                { key: "branch", label: "Kho", align: "left" },
                {
                  key: "type", label: "Loại", align: "center",
                  render: (v) => {
                    const cls = TYPE_STYLE[String(v)] ?? "text-gray-600 bg-gray-50";
                    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{String(v)}</span>;
                  }
                },
                {
                  key: "quantity", label: "Số lượng", align: "right",
                  render: (v) => {
                    const n = Number(v);
                    return <span className={n >= 0 ? "text-green-600 font-medium" : "text-red-500 font-medium"}>
                      {n >= 0 ? "+" : ""}{fmtMoney.format(Math.abs(n))}
                    </span>;
                  }
                },
                { key: "staff", label: "NV thực hiện", align: "left" },
              ]}
              data={d.entries}
            />
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
