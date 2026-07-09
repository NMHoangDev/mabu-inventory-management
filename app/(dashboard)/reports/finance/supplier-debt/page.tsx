"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ReportShell, ReportTable, fmtMoney, formatFullDate } from "@/components/reports/ReportShell";

interface DebtRow {
  id: string | null;
  name: string;
  phone: string;
  total_transactions: number;
  total_amount: number;
  total_paid: number;
  outstanding: number;
  last_at: string;
}

export default function SupplierDebtPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DebtRow[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/debt?type=supplier", { cache: "no-store" });
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotalOutstanding(Number(data.total_outstanding) || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ReportShell
      title="Báo cáo công nợ nhà cung cấp"
      description="Đơn nhập hàng còn chưa thanh toán đủ cho nhà cung cấp (chưa thanh toán / thanh toán một phần)."
      backHref="/reports/finance"
      loading={loading}
      actions={
        <button onClick={load} className="p-2 border border-gray-200 rounded hover:bg-gray-50">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      }
    >
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Tổng công nợ phải trả</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{fmtMoney.format(totalOutstanding)} đ</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Số nhà cung cấp còn nợ</div>
          <div className="mt-1 text-2xl font-bold text-gray-800">{rows.length}</div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-800">Danh sách nhà cung cấp còn nợ</h3>
        </div>
        <ReportTable
          empty="Không còn nợ nhà cung cấp nào."
          columns={[
            { key: "name", label: "Nhà cung cấp", align: "left" },
            { key: "phone", label: "Điện thoại", align: "left", render: (v) => (v ? String(v) : "—") },
            { key: "total_transactions", label: "Số đơn nhập", align: "right" },
            { key: "total_amount", label: "Tổng giá trị", align: "right", render: (v) => `${fmtMoney.format(Number(v))} đ` },
            { key: "total_paid", label: "Đã thanh toán", align: "right", render: (v) => `${fmtMoney.format(Number(v))} đ` },
            {
              key: "outstanding",
              label: "Còn nợ",
              align: "right",
              render: (v) => <span className="font-semibold text-red-600">{fmtMoney.format(Number(v))} đ</span>
            },
            { key: "last_at", label: "Đơn gần nhất", align: "right", render: (v) => (v ? formatFullDate(String(v)) : "—") }
          ]}
          data={rows}
        />
      </div>
    </ReportShell>
  );
}
