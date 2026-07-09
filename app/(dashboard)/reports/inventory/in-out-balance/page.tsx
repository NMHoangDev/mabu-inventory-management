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
import { fetchInOutBalance } from "@/services/reportService";

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

export default function InOutBalancePage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    items: any[];
    daily: any[];
    total_beginning: number;
    total_import: number;
    total_export: number;
    total_ending: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo
        ? { from: dateFrom, to: dateTo }
        : getDateRange(period);
      const result = await fetchInOutBalance(range);
      setData({
        items: result.items,
        daily: result.daily,
        total_beginning: result.summary.total_beginning,
        total_import: result.summary.total_import,
        total_export: result.summary.total_export,
        total_ending: result.summary.total_ending,
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
      title="Báo cáo xuất nhập tồn sản phẩm"
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
            <SummaryCard label="Tồn đầu kỳ" value={fmtMoney.format(d.total_beginning)} sub="Sản phẩm" color="blue" />
            <SummaryCard label="Nhập trong kỳ" value={fmtMoney.format(d.total_import)} sub="Sản phẩm" color="green" />
            <SummaryCard label="Xuất trong kỳ" value={fmtMoney.format(d.total_export)} sub="Sản phẩm" color="red" />
            <SummaryCard label="Tồn cuối kỳ" value={fmtMoney.format(d.total_ending)} sub="Sản phẩm" color="purple" />
          </div>

          {view === "chart" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-800 text-sm mb-4">Xuất nhập theo ngày</h3>
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
              <h3 className="font-semibold text-gray-800 text-sm">Chi tiết xuất nhập tồn theo sản phẩm</h3>
            </div>
            <ReportTable
              columns={[
                { key: "product_name", label: "Sản phẩm", align: "left" },
                { key: "sku", label: "SKU", align: "center" },
                { key: "category_name", label: "Danh mục", align: "left" },
                {
                  key: "import_qty", label: "Nhập trong kỳ", align: "right",
                  render: (v) => <span className="text-green-600">{fmtMoney.format(Number(v))}</span>
                },
                {
                  key: "export_qty", label: "Xuất trong kỳ", align: "right",
                  render: (v) => <span className="text-red-500">{fmtMoney.format(Number(v))}</span>
                },
                { key: "import_value", label: "Giá trị nhập", align: "right", render: (v) => fmtMoney.format(Number(v)) },
              ]}
              data={d.items}
            />
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
