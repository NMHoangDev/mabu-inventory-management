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
  SummaryCard,
} from "@/components/reports/ReportShell";
import { fetchInventoryDetail } from "@/services/reportService";

const STATE_STYLE: Record<string, string> = {
  active: "text-green-600 bg-green-50",
  "Còn hàng": "text-green-600 bg-green-50",
  "Hết hàng": "text-red-500 bg-red-50",
  "Đang vận chuyển": "text-blue-600 bg-blue-50",
  "Kiểm kê": "text-amber-600 bg-amber-50",
  "Hàng lỗi": "text-gray-600 bg-gray-100",
};

export default function InventoryDetailPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    items: any[];
    total_quantity: number;
    total_reserved: number;
    total_value: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      const result = await fetchInventoryDetail(range);
      setData({ items: result.items, total_quantity: result.summary.total_quantity, total_reserved: result.summary.total_reserved, total_value: result.summary.total_value });
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
      title="Báo cáo tồn kho chi tiết"
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
            <SummaryCard label="Tổng sản phẩm" value={fmtMoney.format(d.items.length)} sub="Loại" color="blue" />
            <SummaryCard label="Tổng tồn" value={fmtMoney.format(d.total_quantity)} sub="Sản phẩm" color="green" />
            <SummaryCard label="Đã đặt hàng" value={fmtMoney.format(d.total_reserved)} sub="Sản phẩm" color="amber" />
            <SummaryCard label="Giá trị" value={fmtMoney.format(d.total_value)} sub="VNĐ" color="purple" />
          </div>

          <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Chi tiết tồn kho theo trạng thái</h3>
            </div>
            <ReportTable
              columns={[
                { key: "product_name", label: "Sản phẩm", align: "left" },
                { key: "sku", label: "SKU", align: "center" },
                { key: "category_name", label: "Danh mục", align: "left" },
                { key: "branch", label: "Kho", align: "left" },
                { key: "available_quantity", label: "Còn hàng", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                { key: "reserved_quantity", label: "Đã đặt", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                { key: "cost_price", label: "Đơn giá", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                { key: "total_value", label: "Giá trị", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                {
                  key: "status", label: "Trạng thái", align: "center",
                  render: (v) => {
                    const cls = STATE_STYLE[String(v)] ?? "text-gray-600 bg-gray-50";
                    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{String(v)}</span>;
                  }
                },
              ]}
              data={d.items}
            />
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
