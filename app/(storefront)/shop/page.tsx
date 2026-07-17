"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { StorefrontProductSummary, StorefrontCategory } from "@/lib/storefront/catalog";

interface Settings {
  store_name: string;
  banner_url: string;
  hero_title: string;
  hero_subtitle: string;
  announcement: string;
}

export default function StorefrontHomePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [categories, setCategories] = useState<StorefrontCategory[]>([]);
  const [products, setProducts] = useState<StorefrontProductSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/storefront/settings").then((r) => r.json()),
      fetch("/api/storefront/categories").then((r) => r.json()),
      fetch("/api/storefront/products?page_size=12").then((r) => r.json()),
    ])
      .then(([s, c, p]) => {
        setSettings(s.settings ?? null);
        setCategories(c.categories ?? []);
        setProducts(p.products ?? []);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-10 pb-16">
      {settings?.announcement && (
        <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-bg)] px-5 py-3 text-sm font-medium text-[var(--warning-foreground)] shadow-sm flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-[var(--warning)] animate-pulse" />
          {settings.announcement}
        </div>
      )}

      <section
        className="relative flex flex-col items-start justify-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 px-8 py-20 text-white shadow-elegant sm:px-14 sm:py-28 group"
      >
        {settings?.banner_url && (
          <div 
            className="absolute inset-0 opacity-40 mix-blend-overlay transition-transform duration-1000 group-hover:scale-105"
            style={{ backgroundImage: `url(${settings.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }}
          />
        )}
        <div className="absolute inset-0 bg-black/10" />
        
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-white drop-shadow-md">
            {settings?.hero_title || "Khám Phá Phong Cách Mới"}
          </h1>
          {settings?.hero_subtitle && (
            <p className="mt-4 max-w-xl text-base font-medium text-white/90 sm:text-lg sm:leading-relaxed drop-shadow-sm">
              {settings.hero_subtitle}
            </p>
          )}
          <Link
            href="/shop/products"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-slate-900 shadow-soft transition-all hover:scale-105 hover:bg-slate-50 hover:shadow-lg"
          >
            Mua Sắm Ngay
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {categories.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Danh Mục Nổi Bật</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/shop/products?category=${c.slug}`}
                className="group relative flex items-center gap-2 overflow-hidden rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--primary)] hover:text-[var(--primary)] hover:shadow-md"
              >
                <span>{c.name}</span>
                <span className="flex h-5 items-center justify-center rounded-full bg-slate-100 px-2 text-[10px] font-bold text-slate-500 transition-colors group-hover:bg-primary/10 group-hover:text-[var(--primary)]">
                  {c.product_count}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Sản Phẩm Mới Nhất</h2>
            <p className="mt-1 text-sm text-slate-500">Những mặt hàng vừa được cập nhật hôm nay.</p>
          </div>
          <Link href="/shop/products" className="group flex items-center gap-1 text-sm font-bold text-[var(--primary)] hover:underline">
            Xem tất cả <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-20 text-[var(--primary)]">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-20 text-center">
            <p className="text-slate-500 font-medium">Chưa có sản phẩm nào được hiển thị.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:gap-6">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
