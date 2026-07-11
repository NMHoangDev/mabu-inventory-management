"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw, Table2 } from "lucide-react";
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
import { fetchPurchaseByOrder, type PurchaseOrderData } from "@/services/reportService";
import { formatCurrencyVND } from "@/lib/shared/format";

const STATUS_COLORS: Record<string, string> = {
  "Hoàn thành": "text-green-600 bg-green-50",
  completed: "text-green-600 bg-green-50",
  "Đang xử lý": "text-amber-600 bg-amber-50",
  in_progress: "text-amber-600 bg-amber-50",
  pending: "text-blue-600 bg-blue-50",
  "Đã hủy": "text-red-500 bg-red-50",
  cancelled: "text-red-500 bg-red-50",
};

export default function ByOrderPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    orders: PurchaseOrderData[];
    total_receipts: number;
    total_amount: number;
    completed: number;
    cancelled: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      const result = await fetchPurchaseByOrder(range);
      setData({
        orders: result.orders,
        total_receipts: result.summary.total_receipts,
        total_amount: result.summary.total_amount,
        completed: result.summary.completed,
        cancelled: result.summary.cancelled,
      });
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
      title="Báo cáo nhập hàng theo đơn nhập"
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
        <button onClick={load} className="p-2 border border-gray-200 rounded hover:bg-gray-50">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {d ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard label="Tổng đơn nhập" value={fmtMoney.format(d.total_receipts)} sub="Đơn" color="blue" />
            <SummaryCard label="Tổng giá trị" value={formatCurrencyVND(d.total_amount)} color="green" />
            <SummaryCard label="Hoàn thành" value={fmtMoney.format(d.completed)} sub={`${((d.completed / Math.max(d.total_receipts, 1)) * 100).toFixed(1)}%`} color="purple" />
            <SummaryCard label="Đã hủy" value={fmtMoney.format(d.cancelled)} sub={`${((d.cancelled / Math.max(d.total_receipts, 1)) * 100).toFixed(1)}%`} color="red" />
          </div>

          <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Danh sách đơn nhập hàng</h3>
            </div>
            <ReportTable
              columns={[
                { key: "code", label: "Mã đơn", align: "left" },
                { key: "received_at", label: "Ngày", align: "center", render: (v) => formatFullDate(String(v).slice(0, 10)) },
                { key: "supplier_name", label: "Nhà cung cấp", align: "left" },
                { key: "staff", label: "Nhân viên", align: "left" },
                {
                  key: "receipt_status", label: "Trạng thái", align: "center",
                  render: (v) => {
                    const cls = STATUS_COLORS[String(v)] ?? "text-gray-600 bg-gray-50";
                    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{String(v)}</span>;
                  }
                },
                { key: "item_count", label: "Số SP", align: "right" },
                { key: "total", label: "Tổng tiền", align: "right", render: (v) => formatCurrencyVND(Number(v)) },
              ]}
              data={d.orders}
            />
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
