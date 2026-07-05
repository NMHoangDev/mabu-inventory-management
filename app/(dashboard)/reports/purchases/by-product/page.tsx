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
  ReportTable,
  SvgBarChart,
  SvgLineChart,
  SummaryCard,
} from "@/invoice-flow-manager-fe/components/reports/ReportShell";
import { fetchPurchaseByProduct, type ProductPurchaseData } from "@/services/reportService";

export default function ByProductPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    products: ProductPurchaseData[];
    daily: { day: string; total_qty: number; total_amount: number }[];
    totalQty: number;
    totalAmount: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      const result = await fetchPurchaseByProduct(range);
      const totalQty = result.products.reduce((s: number, p: ProductPurchaseData) => s + p.total_qty, 0);
      const totalAmount = result.products.reduce((s: number, p: ProductPurchaseData) => s + p.total_amount, 0);
      setData({ ...result, totalQty, totalAmount });
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
      title="Báo cáo nhập hàng theo sản phẩm"
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
            <SummaryCard label="Tổng sản phẩm" value={String(d.products.length)} sub="Loại" color="blue" />
            <SummaryCard label="Tổng số lượng" value={fmtMoney.format(d.totalQty)} sub="Sản phẩm" color="purple" />
            <SummaryCard label="Tổng giá trị" value={fmtMoney.format(d.totalAmount)} sub="VNĐ" color="green" />
            <SummaryCard label="Giá TB" value={fmtMoney.format(d.totalAmount / Math.max(d.totalQty, 1))} sub="VNĐ/sản phẩm" color="amber" />
          </div>

          {view === "chart" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-800 text-sm mb-4">Số lượng nhập theo ngày</h3>
                <SvgBarChart
                  labels={d.daily.map((pt) => formatDate(pt.day))}
                  datasets={[{ label: "SL nhập", data: d.daily.map((pt) => pt.total_qty), color: "#0088ff" }]}
                  height={180}
                />
              </div>
              <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-800 text-sm mb-4">Giá trị nhập theo ngày</h3>
                <SvgLineChart
                  labels={d.daily.map((pt) => formatDate(pt.day))}
                  datasets={[{ label: "Giá trị", data: d.daily.map((pt) => pt.total_amount), color: "#0088ff" }]}
                  height={180}
                />
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Danh sách sản phẩm nhập hàng</h3>
            </div>
            <ReportTable
              columns={[
                { key: "product_name", label: "Sản phẩm", align: "left" },
                { key: "sku", label: "SKU", align: "center" },
                { key: "total_qty", label: "SL nhập", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                { key: "avg_price", label: "Đơn giá TB", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                { key: "total_amount", label: "Tổng tiền", align: "right", render: (v) => fmtMoney.format(Number(v)) },
              ]}
              data={d.products}
            />
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
