"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Package, Search, ShoppingCart, Store } from "@/components/shop/icons";
import { useCartStore } from "@/store/shopCart";
import { LOGO_WORDMARK, PHONE, PHONE_DISPLAY } from "@/components/shop/constants";
import type { StorefrontCategory } from "@/lib/storefront/catalog";

interface HeaderProps {
  categories: StorefrontCategory[];
  activeCategory?: string;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

function CategoryPills({
  categories,
  activeId,
  onNavigate,
}: {
  categories: StorefrontCategory[];
  activeId?: string;
  onNavigate?: (slug: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-white to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white to-transparent" />
      <div className="flex gap-1.5 overflow-x-auto px-3 shop-scrollbar-hide">
        {categories.map((cat) => {
          const isActive = activeId === cat.slug;
          return (
            <a
              key={cat.id}
              href={`/shop#cat-${cat.slug}`}
              onClick={
                onNavigate
                  ? (e) => {
                      e.preventDefault();
                      onNavigate(cat.slug);
                    }
                  : undefined
              }
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-center text-[13px] font-semibold transition-colors ${
                isActive ? "border-shop-primary bg-shop-primary text-white" : "border-shop-border bg-white text-shop-text-muted"
              }`}
            >
              {cat.name}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  onSubmit,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  className?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      className={`flex h-10 items-center gap-2 rounded-[18px] border border-shop-border bg-white px-4 shadow-sm transition focus-within:border-shop-primary focus-within:ring-2 focus-within:ring-shop-primary/15 ${className}`}
    >
      <Search size={17} className="shrink-0 text-shop-text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tìm bánh, kẹo, đồ ăn vặt..."
        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-shop-text-muted lg:text-[14px]"
      />
    </form>
  );
}

export default function Header({ categories, activeCategory, searchQuery, onSearchChange }: HeaderProps) {
  const router = useRouter();
  const { totalItems, toggleCart } = useCartStore();
  const count = totalItems();
  const [localQuery, setLocalQuery] = useState("");
  const controlled = onSearchChange !== undefined;
  const queryValue = controlled ? searchQuery ?? "" : localQuery;

  const handleQueryChange = controlled ? onSearchChange! : setLocalQuery;
  const handleSubmit = useCallback(() => {
    if (!controlled && localQuery.trim()) {
      router.push(`/shop?q=${encodeURIComponent(localQuery.trim())}`);
    }
  }, [controlled, localQuery, router]);

  const scrollToSection = useCallback((slug: string) => {
    const el = document.getElementById(`cat-${slug}`);
    if (el) {
      const offset = 140;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }, []);

  const onNavigate = activeCategory !== undefined ? scrollToSection : undefined;

  return (
    <>
      {/* Mobile header */}
      <header className="sticky top-0 z-30 border-b border-shop-border bg-white/98 pb-1.5 pt-1 shadow-sm backdrop-blur lg:hidden">
        <div className="px-4">
          <div className="h-11 overflow-hidden">
            <div className="grid grid-cols-[40px_1fr_40px] items-center">
              <button
                type="button"
                className="grid size-10 place-items-center rounded-full text-black"
                aria-label="Mở danh mục"
                onClick={() => scrollToSection(categories[0]?.slug ?? "")}
              >
                <Store size={20} />
              </button>
              <div className="flex flex-col items-center">
                <Link href="/shop" className="relative h-7 w-36 overflow-hidden">
                  <img src={LOGO_WORDMARK} alt="Denfood" className="h-full w-full object-contain" />
                </Link>
                <p className="-mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-shop-primary">đặt nhanh</p>
              </div>
              <div aria-hidden="true" />
            </div>
          </div>

          <div className="mt-1.5 grid grid-cols-[1fr_38px_38px] items-center gap-2">
            <SearchInput value={queryValue} onChange={handleQueryChange} onSubmit={handleSubmit} />
            <Link
              href="/shop/don"
              className="grid size-[38px] place-items-center rounded-full border border-shop-border bg-white text-black shadow-sm transition-colors active:bg-shop-primary-light"
              aria-label="Đơn của tôi"
            >
              <Package size={19} />
            </Link>
            <button
              type="button"
              onClick={toggleCart}
              className="relative grid size-[38px] place-items-center rounded-full border border-shop-border bg-white text-black shadow-sm transition-colors active:bg-shop-primary-light"
              aria-label="Mở giỏ hàng"
            >
              <ShoppingCart size={21} />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-shop-primary px-1 text-[10px] font-bold leading-4 text-white">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="mt-1.5 border-t border-shop-border pt-1.5">
          <CategoryPills categories={categories} activeId={activeCategory} onNavigate={onNavigate} />
        </div>
      </header>

      {/* Desktop header */}
      <header className="sticky top-0 z-30 hidden border-b border-shop-border bg-white/96 py-3 shadow-sm backdrop-blur lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 xl:max-w-[1440px] 2xl:max-w-[1600px]">
          <Link href="/shop" className="relative h-9 w-40 shrink-0 overflow-hidden">
            <img src={LOGO_WORDMARK} alt="Denfood" className="h-full w-full object-contain object-left" />
          </Link>

          <div className="relative min-w-0 flex-1">
            <SearchInput value={queryValue} onChange={handleQueryChange} onSubmit={handleSubmit} className="h-11 !rounded-2xl pl-1" />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`tel:${PHONE}`}
              className="hidden h-11 items-center gap-2 rounded-2xl border border-shop-border bg-white px-4 text-sm font-bold text-black transition-colors hover:border-shop-primary hover:text-shop-primary xl:inline-flex"
            >
              <Package size={16} />
              <span className="tabular-nums">{PHONE_DISPLAY}</span>
            </a>
            <Link
              href="/shop/don"
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-shop-border bg-white px-4 text-sm font-bold text-black transition-colors hover:border-shop-primary hover:text-shop-primary"
            >
              <Package size={16} />
              Tra đơn
            </Link>
            <button
              type="button"
              onClick={toggleCart}
              className="relative inline-flex h-11 items-center gap-2 rounded-2xl bg-shop-primary px-4 text-sm font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,0.22)] transition-transform hover:brightness-105 active:scale-[0.98]"
            >
              <ShoppingCart size={16} />
              Giỏ hàng
              {count > 0 && (
                <span className="absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-black px-1 text-[10px] font-bold text-white">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="mx-auto mt-2 max-w-7xl px-6 xl:max-w-[1440px] 2xl:max-w-[1600px]">
          <CategoryPills categories={categories} activeId={activeCategory} onNavigate={onNavigate} />
        </div>
      </header>
    </>
  );
}
