"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Package, Search, ShoppingCart, Store } from "@/components/shop/icons";
import { useCartStore } from "@/store/shopCart";
import { PHONE, PHONE_DISPLAY } from "@/components/shop/constants";
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
        placeholder="Tìm phụ kiện, văn phòng phẩm..."
        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-shop-text-muted lg:text-[14px]"
      />
    </form>
  );
}

function CartBadge({ count, variant }: { count: number; variant: "mobile" | "desktop" }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || count === 0) return null;

  const label = count > 99 ? "99+" : count;

  if (variant === "mobile") {
    return (
      <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-shop-primary px-1 text-[10px] font-bold leading-4 text-white">
        {label}
      </span>
    );
  }

  return (
    <span className="absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-black px-1 text-[10px] font-bold text-white">
      {label}
    </span>
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
          <div className="h-12 overflow-hidden flex items-center">
            <div className="grid grid-cols-[40px_1fr_40px] items-center w-full">
              <button
                type="button"
                className="grid size-10 place-items-center rounded-full text-black"
                aria-label="Mở danh mục"
                onClick={() => scrollToSection(categories[0]?.slug ?? "")}
              >
                <Store size={20} />
              </button>
              <div className="flex items-center justify-center">
                <Link href="/shop" className="flex items-center">
                  <svg viewBox="0 0 720 220" className="h-10 w-auto overflow-visible">
                    <defs>
                      <linearGradient id="logoGradHeaderM" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#6C5CE7"/>
                        <stop offset="55%" stopColor="#4C6FFF"/>
                        <stop offset="100%" stopColor="#FF6FA5"/>
                      </linearGradient>
                    </defs>
                    <g transform="translate(30,45)">
                      <rect x="0" y="0" width="110" height="110" rx="34" fill="url(#logoGradHeaderM)" />
                      <path d="M55 55 L26 32 Q19 55 26 78 Z" fill="#ffffff" />
                      <path d="M55 55 L84 32 Q91 55 84 78 Z" fill="#ffffff" />
                      <rect x="45" y="40" width="20" height="30" rx="6" fill="#ffffff" />
                      <circle cx="55" cy="55" r="8" fill="url(#logoGradHeaderM)" />
                      <path d="M93 15 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" fill="#FFD166" />
                    </g>
                    <text x="165" y="122" fontFamily="Poppins, 'Arial Rounded MT Bold', Arial, sans-serif" fontWeight="800" fontSize="76" fill="url(#logoGradHeaderM)" letterSpacing="-1">Mabuu</text>
                    <text x="168" y="166" fontFamily="Poppins, Arial, sans-serif" fontWeight="700" fontSize="26" fill="#14161F" letterSpacing="11">STORE</text>
                  </svg>
                </Link>
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
              <CartBadge count={count} variant="mobile" />
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
          <Link href="/shop" className="flex shrink-0 items-center">
            <svg viewBox="0 0 720 220" className="h-14 w-auto overflow-visible">
              <defs>
                <linearGradient id="logoGradHeaderD" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6C5CE7"/>
                  <stop offset="55%" stopColor="#4C6FFF"/>
                  <stop offset="100%" stopColor="#FF6FA5"/>
                </linearGradient>
              </defs>
              <g transform="translate(30,45)">
                <rect x="0" y="0" width="110" height="110" rx="34" fill="url(#logoGradHeaderD)" />
                <path d="M55 55 L26 32 Q19 55 26 78 Z" fill="#ffffff" />
                <path d="M55 55 L84 32 Q91 55 84 78 Z" fill="#ffffff" />
                <rect x="45" y="40" width="20" height="30" rx="6" fill="#ffffff" />
                <circle cx="55" cy="55" r="8" fill="url(#logoGradHeaderD)" />
                <path d="M93 15 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" fill="#FFD166" />
              </g>
              <text x="165" y="122" fontFamily="Poppins, 'Arial Rounded MT Bold', Arial, sans-serif" fontWeight="800" fontSize="76" fill="url(#logoGradHeaderD)" letterSpacing="-1">Mabuu</text>
              <text x="168" y="166" fontFamily="Poppins, Arial, sans-serif" fontWeight="700" fontSize="26" fill="#14161F" letterSpacing="11">STORE</text>
            </svg>
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
              <CartBadge count={count} variant="desktop" />
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