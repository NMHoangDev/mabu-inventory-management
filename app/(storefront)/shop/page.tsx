"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
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
    <div className="space-y-8">
      <section
        className="panel brand-gradient flex flex-col items-start justify-center gap-3 overflow-hidden px-6 py-12 text-[var(--primary-foreground)] sm:px-10"
        style={
          settings?.banner_url
            ? { backgroundImage: `url(${settings.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        <h1 className="max-w-xl text-2xl font-semibold sm:text-3xl">{settings?.hero_title || "Chào mừng bạn đến với cửa hàng"}</h1>
        {settings?.hero_subtitle && <p className="max-w-lg text-sm opacity-90 sm:text-base">{settings.hero_subtitle}</p>}
        <Link
          href="/shop/products"
          className="mt-2 rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-[var(--primary)] shadow-soft hover:opacity-90"
        >
          Xem sản phẩm
        </Link>
      </section>

      {settings?.announcement && (
        <div className="rounded-md border border-[var(--warning)] bg-[var(--warning-bg)] px-4 py-2.5 text-sm text-[var(--warning-foreground)]">
          {settings.announcement}
        </div>
      )}

      {categories.length > 0 && (
        <section>
          <h2 className="section-title mb-3 text-base">Danh mục</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/shop/products?category=${c.slug}`}
                className="rounded-full border px-4 py-2 text-sm font-medium hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                {c.name} <span className="text-[var(--muted-foreground)]">({c.product_count})</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title text-base">Sản phẩm mới</h2>
          <Link href="/shop/products" className="text-sm font-medium text-[var(--primary)] hover:underline">
            Xem tất cả
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-12 text-[var(--muted-foreground)]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <p className="py-12 text-center text-[var(--muted-foreground)]">Chưa có sản phẩm nào.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
