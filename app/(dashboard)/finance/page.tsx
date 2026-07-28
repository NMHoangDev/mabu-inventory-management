"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertCircle,
  Loader2,
  ChevronRight,
  Banknote,
  Receipt,
  Users,
  ArrowDownCircle,
  ArrowUpCircle,
} from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";
import { PageGuard } from "@/components/auth/PageGuard";

interface AgingRow {
  bucket: string;
  label: string;
  order_count: number;
  amount: number;
}

interface CustomerDebt {
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  total_debt: number;
  order_count: number;
  oldest_order_date: string | null;
}

interface FinanceSummary {
  total_receivable: number;
  total_payable: number;
  cash_in_this_month: number;
  revenue_this_month: number;
  orders_this_month: number;
  unpaid_order_count: number;
  aging: AgingRow[];
  top_debtors: CustomerDebt[];
  recent_payments: Array<{
    order_id: string;
    order_code: string;
    customer_name: string;
    amount: number;
    paid: number;
    remaining: number;
    days_old: number;
  }>;
  avg_days_to_pay: number;
  incoming_cod_30d: number;
}

export default function FinancePage() {
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/finance/summary")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="panel flex min-h-[400px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tính toán dòng tiền…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="panel flex min-h-[400px] items-center justify-center text-slate-500">
        Không có dữ liệu tài chính. Vui lòng cấu hình DATABASE_URL.
      </div>
    );
  }

  const cashflow = data.cash_in_this_month - data.total_payable;
  const maxAging = data.aging.reduce((max, a) => Math.max(max, a.amount), 0) || 1;

  return (
    <PageGuard anyOf={["receipt_vouchers.view", "payment_vouchers.view"]}>
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600" />
            Tài chính & Công nợ
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Dòng tiền, công nợ phải thu, phải trả và tốc độ thanh toán
          </p>
        </div>
        <Link
          href="/orders?payment=unpaid"
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
        >
          Xem đơn chưa thanh toán ({data.unpaid_order_count})
        </Link>
      </header>

      {/* KPI row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Phải thu khách"
          value={formatCurrencyVND(data.total_receivable)}
          sub={`${data.unpaid_order_count} đơn chưa thu xong`}
          icon={<ArrowDownCircle className="h-5 w-5" />}
          color="from-emerald-500 to-teal-500"
        />
        <KpiCard
          title="Phải trả NCC"
          value={formatCurrencyVND(data.total_payable)}
          sub="Tổng hóa đơn 60 ngày gần nhất"
          icon={<ArrowUpCircle className="h-5 w-5" />}
          color="from-red-500 to-rose-500"
        />
        <KpiCard
          title="Dòng tiền tháng"
          value={formatCurrencyVND(cashflow)}
          sub={`Đã thu ${formatCurrencyVND(data.cash_in_this_month)}`}
          icon={cashflow >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          color={cashflow >= 0 ? "from-blue-500 to-indigo-500" : "from-orange-500 to-amber-500"}
        />
        <KpiCard
          title="COD sắp về"
          value={formatCurrencyVND(data.incoming_cod_30d)}
          sub={`TB ${data.avg_days_to_pay} ngày để thu tiền`}
          icon={<Banknote className="h-5 w-5" />}
          color="from-violet-500 to-purple-500"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Aging chart */}
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              Tuổi nợ phải thu (Aging)
            </h2>
            <span className="text-xs text-slate-500">Sắp xếp theo thời gian nợ</span>
          </div>
          <div className="space-y-3">
            {data.aging.map((row) => {
              const pct = (row.amount / maxAging) * 100;
              const isCritical = row.bucket === "90_plus" && row.amount > 0;
              const isWarning = (row.bucket === "31_60" || row.bucket === "61_90") && row.amount > 0;
              return (
                <div key={row.bucket}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className={`font-medium ${isCritical ? "text-red-700" : isWarning ? "text-amber-700" : "text-slate-700"}`}>
                      {row.label}
                      {isCritical && <AlertCircle className="inline h-3 w-3 ml-1" />}
                    </span>
                    <span className="text-slate-600">
                      {row.order_count} đơn · <span className="font-mono font-semibold">{formatCurrencyVND(row.amount)}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded overflow-hidden">
                    <div
                      className={`h-full rounded ${
                        isCritical ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
            💡 <strong>Mẹo:</strong> Nợ trên 60 ngày nên nhắc khách ngay để tránh mất tiền.
          </div>
        </div>

        {/* Top debtors */}
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Users className="h-4 w-4 text-red-600" />
              Top khách nợ nhiều nhất
            </h2>
          </div>
          {data.top_debtors.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center">Tuyệt vời, không có khách nợ!</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.top_debtors.slice(0, 8).map((d, i) => (
                <div key={i} className="py-2.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{d.customer_name}</div>
                    <div className="text-xs text-slate-500">
                      {d.customer_phone || "—"} · {d.order_count} đơn
                      {d.oldest_order_date && ` · từ ${formatDate(d.oldest_order_date)}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-red-600 tabular-nums">{formatCurrencyVND(d.total_debt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent payments */}
      <div className="panel p-4">
        <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-blue-600" />
          Đơn đang thu tiền dở
        </h2>
        {data.recent_payments.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">Không có đơn nào đang thu dở.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left py-2 px-2">Mã đơn</th>
                  <th className="text-left py-2 px-2">Khách</th>
                  <th className="text-right py-2 px-2">Tổng</th>
                  <th className="text-right py-2 px-2">Đã thu</th>
                  <th className="text-right py-2 px-2">Còn lại</th>
                  <th className="text-right py-2 px-2">Tuổi</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.recent_payments.map((p) => (
                  <tr key={p.order_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-2 font-mono text-xs">
                      <Link href={`/orders/${p.order_id}`} className="text-blue-600 hover:underline">
                        {p.order_code}
                      </Link>
                    </td>
                    <td className="py-2 px-2">{p.customer_name}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatCurrencyVND(p.amount)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-600">{formatCurrencyVND(p.paid)}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold text-red-600">{formatCurrencyVND(p.remaining)}</td>
                    <td className="py-2 px-2 text-right text-xs">
                      <span className={p.days_old > 30 ? "text-red-600 font-semibold" : p.days_old > 7 ? "text-amber-600" : "text-slate-500"}>
                        {p.days_old} ngày
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Link href={`/orders/${p.order_id}`} className="text-blue-600 hover:text-blue-800">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </PageGuard>
  );
}

function KpiCard({ title, value, sub, icon, color }: { title: string; value: string; sub: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
      <div className={`absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br ${color} opacity-10`} />
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${color} text-white mb-2`}>{icon}</div>
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</div>
      <div className="text-[10px] text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}
