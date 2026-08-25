"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/shop/Header";
import Sidebar from "@/components/shop/Sidebar";
import HeroBanner from "@/components/shop/HeroBanner";
import QuickBuySection from "@/components/shop/QuickBuySection";
import ProductSection from "@/components/shop/ProductSection";
import Footer from "@/components/shop/Footer";
import type { StorefrontProductSummary, StorefrontCategory } from "@/lib/storefront/catalog";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function filterProducts(list: StorefrontProductSummary[], query: string): StorefrontProductSummary[] {
  const q = normalize(query.trim());
  if (!q) return list;
  return list.filter(
    (p) => normalize(p.name).includes(q) || normalize(p.short_description).includes(q)
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<StorefrontCategory[]>([]);
  const [products, setProducts] = useState<StorefrontProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const [activeCategory, setActiveCategory] = useState<string>("featured");

  useEffect(() => {
    Promise.all([
      fetch("/api/storefront/categories").then((r) => r.json()),
      fetch("/api/storefront/products?page_size=300").then((r) => r.json()),
    ])
      .then(([c, p]) => {
        setCategories(c.categories ?? []);
        setProducts(p.products ?? []);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const productsByCategory = useMemo(() => {
    const map = new Map<string, StorefrontProductSummary[]>();
    for (const p of products) {
      if (!p.category_id) continue;
      const arr = map.get(p.category_id) ?? [];
      arr.push(p);
      map.set(p.category_id, arr);
    }
    return map;
  }, [products]);

  const newest = useMemo(() => products.slice(0, 8), [products]);
  const filteredAll = useMemo(() => filterProducts(products, searchQuery), [products, searchQuery]);
  const showSearchResults = searchQuery.trim().length > 0;

  useEffect(() => {
    if (showSearchResults || categories.length === 0) return;
    const ids = ["featured", ...categories.map((c) => `cat-${c.slug}`)];
    const observers: IntersectionObserver[] = [];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveCategory(id === "featured" ? "featured" : id.replace("cat-", ""));
            }
          });
        },
        { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [categories, showSearchResults]);

  const handleSearchChange = useCallback((q: string) => setSearchQuery(q), []);

  return (
    <main className="mx-auto min-h-screen max-w-md pb-[120px] text-shop-text md:max-w-2xl lg:max-w-none lg:pb-12">
      <Header categories={categories} activeCategory={activeCategory} searchQuery={searchQuery} onSearchChange={handleSearchChange} />

      <div className="lg:mx-auto lg:grid lg:max-w-7xl lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6 lg:px-6 lg:pt-4 xl:max-w-[1440px] 2xl:max-w-[1600px]">
        <Sidebar categories={categories} activeCategory={activeCategory} />

        <div className="min-w-0">
          <HeroBanner />

          {loading ? (
            <p className="py-16 text-center text-sm text-shop-text-muted">Đang tải sản phẩm...</p>
          ) : showSearchResults ? (
            <ProductSection
              id="search-results"
              title={`Kết quả tìm kiếm (${filteredAll.length})`}
              subtitle={`Tìm thấy ${filteredAll.length} sản phẩm cho "${searchQuery}"`}
              products={filteredAll}
            />
          ) : (
            <>
              <QuickBuySection products={newest} />
              {categories.map((cat) => (
                <ProductSection
                  key={cat.id}
                  id={`cat-${cat.slug}`}
                  title={cat.name}
                  subtitle={`${cat.product_count} sản phẩm`}
                  products={productsByCategory.get(cat.id) ?? []}
                />
              ))}
            </>
          )}
        </div>
      </div>

      <Footer />
    </main>
  );
}

export default function StorefrontHomePage() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
