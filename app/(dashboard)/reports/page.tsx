"use client";

import Link from "next/link";
import { useApp } from "@/invoice-flow-manager-fe/components/providers/AppProvider";
import { parseNumeric } from "@/lib/shared/format";

function fmtNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function fmtCurrency(value: number) {
  return `${fmtNumber(value)} đ`;
}

export default function ReportsPage() {
  const { store, setError } = useApp();

  const totalBeforeTax = store.rows.reduce((total, row) => total + (parseNumeric(row.amountBeforeTax) ?? 0), 0);

  const exportExcel = async () => {
    if (store.rows.length === 0) return;

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: store.rows })
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

  return (
    <section className="space-y-5">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Vận hành</div>
            <h2 className="mt-1 text-2xl font-semibold">Báo cáo</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Dữ liệu vận hành lấy từ hóa đơn đã scan: tạo nhanh sản phẩm, sinh phiếu nhập kho nháp và chuẩn bị đồng bộ bán hàng.
            </p>
          </div>
          <Link href="/blueprint" className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted">
            Xem blueprint
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="text-sm font-semibold">Báo cáo nhập hàng</h3>
          <div className="mt-4 space-y-3">
            {Array.from(new Set(store.rows.map((row) => row.supplierName).filter(Boolean))).slice(0, 5).map((supplier) => {
              const total = store.rows.filter((row) => row.supplierName === supplier).reduce((sum, row) => sum + (parseNumeric(row.amountBeforeTax) ?? 0), 0);
              return (
                <div key={supplier}>
                  <div className="mb-1 flex justify-between gap-3 text-sm">
                    <span className="truncate">{supplier}</span>
                    <span className="tabular-nums">{fmtCurrency(total)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-muted">
                    <div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, totalBeforeTax ? (total / totalBeforeTax) * 100 : 0)}%` }} />
                  </div>
                </div>
              );
            })}
            {store.rows.length === 0 ? <div className="text-sm text-muted-foreground">Chưa có dữ liệu nhập hàng để lập báo cáo.</div> : null}
          </div>
        </div>
        <div className="panel p-5">
          <h3 className="text-sm font-semibold">Xuất Excel định kỳ</h3>
          <p className="mt-2 text-sm text-muted-foreground">Excel là bản lưu trữ. Dữ liệu làm việc chính vẫn nằm trên Supabase/web app.</p>
          <button className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90" onClick={exportExcel}>
            Xuất tổng hợp hiện tại
          </button>
        </div>
      </div>
    </section>
  );
}
