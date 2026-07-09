"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { StorefrontProductSummary, StorefrontCategory } from "@/lib/storefront/catalog";

function ProductsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const category = searchParams.get("category") ?? "";
  const page = Number(searchParams.get("page") ?? 1);

  const [products, setProducts] = useState<StorefrontProductSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<StorefrontCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const pageSize = 24;

  useEffect(() => {
    fetch("/api/storefront/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    fetch(`/api/storefront/products?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setProducts(d.products ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [search, category, page]);

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete("page");
      router.push(`/shop/products?${params.toString()}`);
    },
    [router, searchParams]
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          {search ? `Kết quả cho "${search}"` : category ? categories.find((c) => c.slug === category)?.name ?? "Sản phẩm" : "Tất cả sản phẩm"}
        </h1>
        <span className="section-caption">{total} sản phẩm</span>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setParam("category", "")}
            className={`rounded-full border px-3 py-1.5 text-sm ${!category ? "border-[var(--primary)] bg-[var(--accent)] text-[var(--primary)]" : ""}`}
          >
            Tất cả
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setParam("category", c.slug)}
              className={`rounded-full border px-3 py-1.5 text-sm ${category === c.slug ? "border-[var(--primary)] bg-[var(--accent)] text-[var(--primary)]" : ""}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-[var(--muted-foreground)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : products.length === 0 ? (
        <p className="py-16 text-center text-[var(--muted-foreground)]">Không tìm thấy sản phẩm nào.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                disabled={page <= 1}
                onClick={() => setParam("page", String(page - 1))}
                className="flex h-8 w-8 items-center justify-center rounded border disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm">
                Trang {page}/{totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setParam("page", String(page + 1))}
                className="flex h-8 w-8 items-center justify-center rounded border disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsPageInner />
    </Suspense>
  );
}
