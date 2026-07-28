"use client";

import Link from "next/link";
import { KeyRound, Users } from "lucide-react";

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

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Thiết lập cửa hàng</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/settings/staff" className="panel flex items-start gap-3 p-4 hover:bg-muted/40">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Nhân viên</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Thêm mới & quản lý tài khoản nhân viên</div>
            </div>
          </Link>
          <Link href="/settings/roles" className="panel flex items-start gap-3 p-4 hover:bg-muted/40">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Vai trò và phân quyền</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Quản lý & phân quyền tài khoản nhân viên theo module</div>
            </div>
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
