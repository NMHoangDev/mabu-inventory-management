"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Package,
  Truck,
  Wallet,
  Users,
  ShoppingCart,
  Bell,
  Sparkles,
  ChevronRight,
  Clock,
} from "lucide-react";
import { useApp } from "@/invoice-flow-manager-fe/components/providers/AppProvider";
import type { InvoiceDocument } from "@/lib/shared/schema";
import { formatCurrencyVND } from "@/lib/shared/format";

function fmtNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function documentStatusLabel(document: InvoiceDocument) {
  return document.status === "scanned" ? "Đã scan" : "Lỗi OCR";
}

export default function DashboardPage() {
  const { store, loading, setError } = useApp();

  const appliedDocumentIds = new Set(store.documents.filter((document) => document.appliedToSummary).map((document) => document.id));
  const summaryRows = store.rows.filter((row) => appliedDocumentIds.has(row.documentId));
  const invoiceCount = new Set(summaryRows.map((row) => `${row.supplierName}-${row.invoiceNumber}`)).size;
  const errorDocuments = store.documents.filter((document) => document.status === "error").length;
  const missingSku = summaryRows.filter((row) => !String(row.internalProductCode).trim()).length;
  const missingAdjustedName = summaryRows.filter((row) => !String(row.adjustedInvoiceName).trim()).length;

  const exportExcel = async () => {
    if (summaryRows.length === 0) return;

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: summaryRows })
      });
      if (!response.ok) throw new Error("Không xuất được Excel.");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tong-hop-hoa-don.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xuất được Excel.");
    }
  };

  if (loading) {
    return (
      <div className="panel flex min-h-[320px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Đang tải dữ liệu
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <SmartDashboardStrip />

      <div className="panel flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="section-title">Hóa đơn</div>
          <div className="section-caption mt-0.5">
            {fmtNumber(invoiceCount)} hóa đơn · {fmtNumber(summaryRows.length)} dòng · {fmtNumber(errorDocuments)} lỗi OCR
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/scan" className="rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Scan hóa đơn
          </Link>
          <Link href="/summary" className="rounded-md border bg-white px-3.5 py-2 text-sm font-semibold hover:bg-secondary">
            Tổng hợp
          </Link>
          <button 
            className="rounded-md border bg-white px-3.5 py-2 text-sm font-semibold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50" 
            onClick={exportExcel} 
            disabled={summaryRows.length === 0}
          >
            Xuất Excel
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Hóa đơn scan gần đây</h2>
              <p className="text-xs text-muted-foreground">Dữ liệu lấy từ Supabase/Postgres khi cấu hình DATABASE_URL</p>
            </div>
            <Link href="/scan" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              Upload thêm
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <table className="data-table w-full text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">File</th>
                  <th className="px-3 py-2 text-left">Trạng thái</th>
                  <th className="px-3 py-2 text-right">Dòng</th>
                  <th className="px-3 py-2 text-left">Ngày upload</th>
                </tr>
              </thead>
              <tbody>
                {store.documents.slice(0, 6).map((document) => (
                  <tr key={document.id} className="border-t">
                    <td className="max-w-[320px] truncate px-3 py-2 font-medium">{document.fileName}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${document.status === "scanned" ? "bg-emerald-50 text-emerald-700" : "bg-warning-bg text-warning-foreground"}`}>
                        {documentStatusLabel(document)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{document.rowCount}</td>
                    <td className="px-3 py-2 text-muted-foreground">{document.uploadedAt.slice(0, 10)}</td>
                  </tr>
                ))}
                {store.documents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">Chưa có hóa đơn nào. Bấm Upload thêm để scan.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold">Cảnh báo cần xử lý</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {[
              ["Dòng thiếu MÃ SẢN PHẨM", missingSku],
              ["Dòng thiếu TÊN CHỈNH LẠI", missingAdjustedName],
              ["Tài liệu OCR lỗi", errorDocuments],
              ["Dòng thiếu tên bán lẻ", summaryRows.filter((row) => !String(row.retailName).trim()).length]
            ].map(([label, count]) => (
              <div key={String(label)} className="flex items-center justify-between bg-warning-bg/55 px-4 py-3">
                <div className="text-sm">{label}</div>
                <div className="font-semibold text-warning-foreground tabular-nums">{count}</div>
              </div>
            ))}
          </div>
          <Link href="/summary" className="m-4 block text-center w-[calc(100%-2rem)] rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Mở tổng hợp hóa đơn
          </Link>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Smart Dashboard — KPI bento grid + alerts
// ──────────────────────────────────────────────────────────────────────

interface KpiTrend {
  current: number;
  previous: number;
  direction: "up" | "down" | "flat";
  percent: number;
}

interface DashboardKpis {
  revenue_today: KpiTrend;
  revenue_week: KpiTrend;
  revenue_month: KpiTrend;
  orders_today: number;
  orders_pending: number;
  orders_overdue: number;
  customers_total: number;
  customers_new_this_month: number;
  products_total: number;
  products_out_of_stock: number;
  products_low_stock: number;
  pending_reorder_value: number;
  pending_shippings: number;
  recent_orders: Array<{ id: string; code: string; customer_name: string; total: number; status: string; created_at: string }>;
  top_products: Array<{ product_id: string; product_name: string; qty: number; revenue: number }>;
  hourly_revenue: Array<{ hour: number; revenue: number }>;
  alerts: Array<{ id: string; severity: "info" | "warning" | "critical"; title: string; description: string; action_label?: string; action_path?: string }>;
}

function SmartDashboardStrip() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/dashboard/kpis")
      .then((r) => r.json())
      .then((data) => {
        if (mounted) {
          setKpis(data);
          setLoading(false);
        }
      })
      .catch(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="panel flex items-center justify-center gap-2 px-4 py-6 text-slate-500 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải dashboard thông minh…
      </div>
    );
  }
  if (!kpis) return null;

  const cards = [
    {
      title: "Doanh thu hôm nay",
      value: formatCurrencyVND(kpis.revenue_today.current),
      trend: kpis.revenue_today,
      icon: <Wallet className="h-5 w-5" />,
      color: "from-blue-500 to-indigo-500",
    },
    {
      title: "Doanh thu tuần",
      value: formatCurrencyVND(kpis.revenue_week.current),
      trend: kpis.revenue_week,
      icon: <TrendingUp className="h-5 w-5" />,
      color: "from-emerald-500 to-teal-500",
    },
    {
      title: "Doanh thu tháng",
      value: formatCurrencyVND(kpis.revenue_month.current),
      trend: kpis.revenue_month,
      icon: <TrendingUp className="h-5 w-5" />,
      color: "from-violet-500 to-purple-500",
    },
    {
      title: "Đơn hàng hôm nay",
      value: fmtNumber(kpis.orders_today),
      sub: `${kpis.orders_pending} chờ xử lý · ${kpis.orders_overdue} quá hạn`,
      icon: <ShoppingCart className="h-5 w-5" />,
      color: "from-amber-500 to-orange-500",
    },
  ];

  const quickStats = [
    { label: "Khách hàng", value: fmtNumber(kpis.customers_total), sub: `+${kpis.customers_new_this_month} mới tháng này`, icon: <Users className="h-4 w-4" />, href: "/customers" },
    { label: "Sản phẩm", value: fmtNumber(kpis.products_total), sub: `${kpis.products_out_of_stock} hết · ${kpis.products_low_stock} sắp hết`, icon: <Package className="h-4 w-4" />, href: "/inventory" },
    { label: "Vận đơn chờ", value: fmtNumber(kpis.pending_shippings), sub: "Đang giao / chờ pickup", icon: <Truck className="h-4 w-4" />, href: "/shipping/orders" },
    { label: "Cần nhập hàng", value: formatCurrencyVND(kpis.pending_reorder_value), sub: "Gợi ý từ AI", icon: <Sparkles className="h-4 w-4" />, href: "/inventory" },
  ];

  return (
    <div className="space-y-3">
      {/* Alert banner */}
      {kpis.alerts.length > 0 && (
        <div className="panel border-l-4 border-amber-500 bg-amber-50/60 px-4 py-3 flex items-start gap-3">
          <Bell className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-amber-900">Có {kpis.alerts.length} cảnh báo cần xử lý</div>
            <div className="text-xs text-amber-700 mt-0.5 truncate">
              {kpis.alerts.map(a => a.title).join(" · ")}
            </div>
          </div>
          <Link href="/inventory" className="text-xs font-semibold text-amber-700 hover:underline flex items-center gap-1 flex-shrink-0">
            Xem <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Bento grid: 4 large cards + 4 small */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.title} className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200/60 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-blue-200">
            <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${c.color} opacity-10 transition-transform duration-500 group-hover:scale-150`} />
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${c.color} text-white mb-3 shadow-soft`}>
              {c.icon}
            </div>
            <div className="text-xs font-medium text-slate-500">{c.title}</div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{c.value}</span>
            </div>
            {c.trend && <TrendBadge trend={c.trend} />}
            {c.sub && <div className="text-[10px] text-slate-500 mt-1.5 font-medium">{c.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {quickStats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="group rounded-2xl bg-white border border-slate-200/60 p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-500 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">{s.icon}</span>
                {s.label}
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" />
            </div>
            <div className="text-lg font-bold text-slate-900 mt-2 tabular-nums">{s.value}</div>
            <div className="text-[10px] font-medium text-slate-500 mt-1">{s.sub}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: KpiTrend }) {
  if (trend.direction === "flat" || trend.percent === 0) {
    return (
      <div className="inline-flex items-center gap-1 text-[10px] mt-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
        <Minus className="h-3 w-3" /> 0%
      </div>
    );
  }
  const isUp = trend.direction === "up";
  return (
    <div className={`inline-flex items-center gap-1 text-[10px] mt-1 px-1.5 py-0.5 rounded ${isUp ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {trend.percent}% so với kỳ trước
    </div>
  );
}
