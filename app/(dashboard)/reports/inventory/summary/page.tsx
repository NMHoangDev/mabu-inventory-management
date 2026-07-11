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
import { fetchInventorySummary, fetchInventoryDetail, fetchInOutBalance } from "@/services/reportService";
import { formatCurrencyVND } from "@/lib/shared/format";

// Không có bảng ledger lịch sử nên không thể vẽ "tồn kho tuyệt đối theo
// ngày" một cách trung thực — thay bằng biến động luỹ kế (nhập - xuất cộng
// dồn từ đầu kỳ), tính hoàn toàn từ số liệu thật (daily.import/export).
function cumulativeNet(daily: { import: number; export: number }[]): number[] {
  let running = 0;
  return daily.map((d) => {
    running += (d.import || 0) - (d.export || 0);
    return running;
  });
}

const STATUS_STYLE: Record<string, string> = {
  active: "text-green-600 bg-green-50",
  "Hết hàng": "text-red-500 bg-red-50",
  "Dưới định mức": "text-amber-600 bg-amber-50",
  "Bình thường": "text-green-600 bg-green-50",
};

export default function InventorySummaryPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    summary: { total_products: number; total_stock: number; total_value: number };
    detail: { items: any[]; summary: { total_quantity: number; total_reserved: number; total_value: number } };
    daily: { day: string; import: number; export: number }[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      // Nhập/xuất theo ngày lấy từ /api/reports/inventory?group_by=in_out —
      // trước đây trang này tự sinh 14 điểm Math.random() không liên quan gì
      // tới dữ liệu thật, kể cả khi 2 fetch phía trên đã tải xong.
      const [summary, detail, inOut] = await Promise.all([
        fetchInventorySummary(),
        fetchInventoryDetail(range),
        fetchInOutBalance(range),
      ]);
      const daily = inOut.daily.map((d: any) => ({ day: d.day, import: d.import ?? 0, export: d.export ?? 0 }));
      setData({ summary, detail, daily });
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
      title="Báo cáo tồn kho"
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
            <SummaryCard label="Tổng sản phẩm" value={fmtMoney.format(d.summary.total_products)} sub="Loại" color="blue" />
            <SummaryCard label="Giá trị tồn kho" value={formatCurrencyVND(d.summary.total_value)} color="green" />
            <SummaryCard label="Tổng tồn kho" value={fmtMoney.format(d.summary.total_stock)} sub="Sản phẩm" color="purple" />
            <SummaryCard label="Giá trị" value={formatCurrencyVND(d.detail.summary.total_value)} color="amber" />
          </div>

          {view === "chart" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-800 text-sm mb-4">Xuất nhập tồn kho theo ngày</h3>
                <SvgBarChart
                  labels={d.daily.map((pt) => formatDate(pt.day))}
                  datasets={[
                    { label: "Nhập", data: d.daily.map((pt) => pt.import), color: "#22c55e" },
                    { label: "Xuất", data: d.daily.map((pt) => pt.export), color: "#ef4444" },
                  ]}
                  height={180}
                />
              </div>
              <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-800 text-sm mb-4">Biến động tồn kho luỹ kế (nhập − xuất)</h3>
                <SvgLineChart
                  labels={d.daily.map((pt) => formatDate(pt.day))}
                  datasets={[{ label: "Biến động luỹ kế", data: cumulativeNet(d.daily), color: "#0088ff" }]}
                  height={180}
                />
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Chi tiết tồn kho</h3>
            </div>
            <ReportTable
              columns={[
                { key: "product_name", label: "Sản phẩm", align: "left" },
                { key: "sku", label: "SKU", align: "center" },
                { key: "category_name", label: "Danh mục", align: "left" },
                { key: "branch", label: "Kho", align: "left" },
                { key: "available_quantity", label: "Tồn kho", align: "right", render: (v) => fmtMoney.format(Number(v)) },
                { key: "cost_price", label: "Đơn giá", align: "right", render: (v) => formatCurrencyVND(Number(v)) },
                { key: "total_value", label: "Giá trị", align: "right", render: (v) => formatCurrencyVND(Number(v)) },
              ]}
              data={d.detail.items}
            />
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
