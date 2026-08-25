"use client";

import { PHONE, PHONE_DISPLAY, ZALO_URL } from "@/components/shop/constants";
import type { StorefrontCategory } from "@/lib/storefront/catalog";

export default function Sidebar({
  categories,
  activeCategory,
}: {
  categories: StorefrontCategory[];
  activeCategory: string;
}) {
  const scrollToSection = (slug: string) => {
    const el = document.getElementById(`cat-${slug}`);
    if (el) {
      const offset = 100;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 space-y-3">
        <div className="rounded-2xl border border-shop-border bg-white py-3 shadow-sm">
          <h2 className="px-4 text-[13px] font-black uppercase tracking-[0.05em] text-black">Danh mục</h2>
          <nav className="mt-2 flex flex-col px-2">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.slug;
              return (
                <a
                  key={cat.id}
                  href={`#cat-${cat.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(cat.slug);
                  }}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
                    isActive ? "bg-shop-primary-light text-shop-primary" : "text-shop-text-muted hover:bg-gray-50 hover:text-black"
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className="text-[11px] text-shop-text-muted">{cat.product_count}</span>
                </a>
              );
            })}
          </nav>
        </div>

        <div className="rounded-2xl border border-shop-border bg-white p-4 shadow-sm">
          <p className="text-[12px] font-semibold text-shop-text-muted">Đặt nhanh - Ăn ngon - Giá tốt</p>
          <p className="mt-1 text-[13px] font-bold leading-5 text-black">Chốt đơn qua Zalo, giao tận nơi</p>
          <div className="mt-3 space-y-2">
            <a
              href={`tel:${PHONE}`}
              className="flex items-center justify-between rounded-xl border border-shop-border bg-white px-3 py-2 text-[12px] font-semibold text-black transition hover:border-shop-primary"
            >
              <span className="text-shop-text-muted">Hotline</span>
              <span className="tabular-nums">{PHONE_DISPLAY}</span>
            </a>
            <a
              href={ZALO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-xl bg-shop-primary px-3 py-2 text-[12px] font-bold text-white shadow-[0_3px_10px_rgba(37,99,235,0.22)] transition hover:brightness-105"
            >
              Chat Zalo
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}
