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
  ReportTable
} from "@/components/reports/ReportShell";

interface TopCustomerRow {
  customer_id: string | null;
  name: string;
  phone: string;
  total_orders: number;
  total_revenue: number;
  last_order_at: string;
}

interface CustomersReportData {
  total_customers: number;
  new_customers: number;
  active_customers: number;
  avg_order_value: number;
  top_customers: TopCustomerRow[];
}

export default function CustomersReportPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CustomersReportData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = period === "custom" && dateFrom && dateTo ? { from: dateFrom, to: dateTo } : getDateRange(period);
      const res = await fetch(`/api/reports/customers?from=${range.from}&to=${range.to}`, { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ReportShell
      title="Báo cáo khách hàng"
      description="Tổng quan số lượng khách hàng và khách hàng mang lại doanh thu cao nhất."
      backHref="/reports/sales"
      loading={loading}
      actions={
        <button onClick={load} className="p-2 border border-gray-200 rounded hover:bg-gray-50">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      }
    >
      <div className="mb-6 flex flex-col gap-2">
        <PeriodSelector
          value={period}
          onChange={(p) => {
            setPeriod(p);
            if (p !== "custom") load();
          }}
        />
        {period === "custom" && (
          <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onApply={load} />
        )}
      </div>

      {data ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-500">Tổng khách hàng</div>
              <div className="mt-1 text-2xl font-bold text-gray-800">{data.total_customers}</div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-500">Khách mới trong kỳ</div>
              <div className="mt-1 text-2xl font-bold text-blue-600">{data.new_customers}</div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-500">Có mua hàng trong kỳ</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600">{data.active_customers}</div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-500">Giá trị TB / đơn</div>
              <div className="mt-1 text-2xl font-bold text-gray-800">{fmtMoney.format(data.avg_order_value)} đ</div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-800">Top khách hàng theo doanh thu (trong kỳ)</h3>
            </div>
            <ReportTable
              empty="Chưa có đơn hàng nào trong khoảng thời gian này."
              columns={[
                { key: "name", label: "Khách hàng", align: "left" },
                { key: "phone", label: "Điện thoại", align: "left", render: (v) => (v ? String(v) : "—") },
                { key: "total_orders", label: "Số đơn", align: "right" },
                { key: "total_revenue", label: "Doanh thu", align: "right", render: (v) => `${fmtMoney.format(Number(v))} đ` },
                { key: "last_order_at", label: "Đơn gần nhất", align: "right", render: (v) => (v ? formatFullDate(String(v)) : "—") }
              ]}
              data={data.top_customers}
            />
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
