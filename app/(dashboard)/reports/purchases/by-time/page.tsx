"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw, Table2 } from "lucide-react";
import {
  DateRangePicker,
  DonutChart,
  fmtMoney,
  formatDate,
  formatFullDate,
  getDateRange,
  Period,
  PeriodSelector,
  ReportShell,
  ReportTable,
  SvgBarChart,
  SvgLineChart,
  SummaryCard,
} from "@/components/reports/ReportShell";
import {
  fetchPurchaseByTime,
  fetchPurchaseSummary,
  type PurchaseOrderData,
  type SupplierPurchaseData,
  type ProductPurchaseData,
} from "@/services/reportService";

export default function ByTimePage() {
  const [period, setPeriod] = useState<Period>("7d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    summary: { total_receipts: number; total_amount: number; total_paid: number; total_unpaid: number };
    daily: { day: string; receipt_count?: number; total_amount?: number }[];
    suppliers: SupplierPurchaseData[];
    products: ProductPurchaseData[];
    orders: PurchaseOrderData[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);

      const [summary, detail] = await Promise.all([
        fetchPurchaseSummary(range),
        fetchPurchaseByTime(range),
      ]);

      setData({
        summary: {
          total_receipts: summary.total_receipts,
          total_amount: summary.total_amount,
          total_paid: summary.total_paid,
          total_unpaid: summary.total_unpaid,
        },
        daily: detail.daily,
        suppliers: detail.suppliers,
        products: detail.products,
        orders: detail.orders,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const d = data;
  const STATUS_COLORS: Record<string, string> = {
    "Hoàn thành": "text-green-600 bg-green-50",
    completed: "text-green-600 bg-green-50",
    "Đang xử lý": "text-amber-600 bg-amber-50",
    in_progress: "text-amber-600 bg-amber-50",
    "Đã hủy": "text-red-500 bg-red-50",
    cancelled: "text-red-500 bg-red-50",
  };

  return (
    <ReportShell
      title="Báo cáo nhập hàng theo thời gian"
      backHref="/reports/purchases"
      loading={loading}
    >
      {/* Controls */}
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
            <SummaryCard label="Tổng đơn nhập" value={fmtMoney.format(d.summary.total_receipts)} sub="Đơn" color="blue" />
            <SummaryCard label="Tổng giá trị" value={fmtMoney.format(d.summary.total_amount)} sub="VNĐ" color="green" />
            <SummaryCard label="Đã thanh toán" value={fmtMoney.format(d.summary.total_paid)} sub="VNĐ" color="purple" />
            <SummaryCard label="Còn nợ" value={fmtMoney.format(d.summary.total_unpaid)} sub="VNĐ" color="red" />
          </div>

          {view === "chart" ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                  <h3 className="font-semibold text-gray-800 text-sm mb-4">Số đơn nhập theo ngày</h3>
                  <SvgBarChart
                    labels={d.daily.map((pt) => formatDate(pt.day))}
                    datasets={[{ label: "Đơn nhập", data: d.daily.map((pt) => pt.receipt_count ?? 0), color: "#0088ff" }]}
                    height={180}
                  />
                </div>
                <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                  <h3 className="font-semibold text-gray-800 text-sm mb-4">Giá trị nhập hàng theo ngày</h3>
                  <SvgLineChart
                    labels={d.daily.map((pt) => formatDate(pt.day))}
                    datasets={[{ label: "Giá trị (VNĐ)", data: d.daily.map((pt) => pt.total_amount ?? 0), color: "#0088ff" }]}
                    height={180}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                  <h3 className="font-semibold text-gray-800 text-sm mb-4">Theo nhà cung cấp</h3>
                  <DonutChart
                    data={d.suppliers.slice(0, 5).map((s, i) => ({
                      label: s.supplier_name,
                      value: s.total_amount,
                      color: ["#0088ff", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"][i % 5],
                    }))}
                  />
                </div>

                <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-800 text-sm">Top sản phẩm nhập nhiều nhất</h3>
                  </div>
                  <ReportTable
                    columns={[
                      { key: "product_name", label: "Sản phẩm", align: "left" },
                      { key: "sku", label: "SKU", align: "center" },
                      { key: "total_qty", label: "SL nhập", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                      { key: "total_amount", label: "Tổng tiền", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                    ]}
                    data={d.products.slice(0, 8)}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800 text-sm">Danh sách đơn nhập hàng</h3>
              </div>
              <ReportTable
                columns={[
                  { key: "code", label: "Mã đơn", align: "left" },
                  { key: "received_at", label: "Ngày", align: "center", render: (v) => formatFullDate(String(v).slice(0, 10)) },
                  { key: "supplier_name", label: "Nhà cung cấp", align: "left" },
                  {
                    key: "receipt_status", label: "Trạng thái", align: "center",
                    render: (v) => {
                      const cls = STATUS_COLORS[String(v)] ?? "text-gray-600 bg-gray-50";
                      return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{String(v)}</span>;
                    }
                  },
                  { key: "total", label: "Tổng tiền", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                ]}
                data={d.orders}
              />
            </div>
          )}
        </>
      ) : null}
    </ReportShell>
  );
}
