"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "./ProductCard";
import type { StorefrontProductSummary } from "@/lib/storefront/catalog";

interface ProductSectionProps {
  id: string;
  title: string;
  subtitle: string;
  products: StorefrontProductSummary[];
}

// 12 sản phẩm/trang — vài danh mục có 50-90 sản phẩm, hiện hết 1 lần vừa dài
// trang chủ vừa tải hết ảnh (base64) cùng lúc dù người dùng chưa cuộn tới.
const PAGE_SIZE = 12;

export default function ProductSection({ id, title, subtitle, products }: ProductSectionProps) {
  const [page, setPage] = useState(1);

  // Reset về trang 1 khi danh sách sản phẩm của category này đổi (vd sau khi
  // trang chủ fetch lại) — tránh kẹt ở trang cũ không còn dữ liệu.
  useEffect(() => {
    setPage(1);
  }, [products]);

  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = products.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <section id={id} className="scroll-mt-40 bg-white px-3.5 pb-2 pt-9 first:pt-7 lg:px-0 lg:pt-11 lg:first:pt-6">
      <div className="z-10 mb-3 border-t border-shop-border bg-white/95 pt-5 lg:border-t-0 lg:bg-transparent lg:pt-0">
        <span className="mb-2.5 block h-[3px] w-8 rounded-full bg-shop-primary" />
        <h2 className="text-[22px] font-extrabold leading-7 tracking-[-0.25px] text-black lg:text-[26px] lg:leading-8">{title}</h2>
        <p className="mt-0.5 pb-2 text-[13px] leading-5 text-shop-text-muted lg:text-[14px]">{subtitle}</p>
      </div>

      {products.length === 0 ? (
        <p className="py-10 text-center text-sm text-shop-text-muted">Đang cập nhật sản phẩm...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
            {pagedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-3 pb-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-shop-border text-shop-text disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Trang trước"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold text-shop-text-muted">
                Trang {currentPage}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-shop-border text-shop-text disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Trang sau"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
