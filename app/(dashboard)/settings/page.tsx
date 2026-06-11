"use client";

import Link from "next/link";

export default function SettingsPage() {
  return (
    <section className="space-y-5">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Hệ thống</div>
            <h2 className="mt-1 text-2xl font-semibold">Cài đặt</h2>
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
          <h3 className="text-sm font-semibold">Lưu trữ</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span>Database</span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Supabase Postgres</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span>File gốc</span>
              <span className="rounded-full bg-info-bg px-2.5 py-1 text-xs font-semibold text-info">Supabase Storage / fallback local</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span>OCR</span>
              <span className="rounded-full bg-warning-bg px-2.5 py-1 text-xs font-semibold text-warning-foreground">Gemini Vision</span>
            </div>
          </div>
        </div>
        <div className="panel p-5">
          <h3 className="text-sm font-semibold">Quick options</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Supplier, SKU, tên chỉnh lại, tên bán lẻ, đơn vị tính và VAT được lưu lại để gợi ý nhanh trong form/bảng.
          </p>
        </div>
      </div>
    </section>
  );
}
