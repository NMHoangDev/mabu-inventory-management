"use client";

import Link from "next/link";

export default function ProductPricingPage() {
  return (
    <section className="space-y-5">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Bảng giá</div>
            <h2 className="mt-1 text-2xl font-semibold">Quản lý Bảng giá</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Thiết lập chính sách giá bán, giá sỉ, giá lẻ cho sản phẩm.
            </p>
          </div>
          <Link href="/products" className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted">
            Quay lại sản phẩm
          </Link>
        </div>
      </div>

      <div className="panel overflow-hidden p-8 text-center text-slate-500">
        Nội dung trang bảng giá sẽ được triển khai tại đây.
      </div>
    </section>
  );
}
