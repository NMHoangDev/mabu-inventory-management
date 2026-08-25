"use client";

import ProductCard from "./ProductCard";
import type { StorefrontProductSummary } from "@/lib/storefront/catalog";

// Repurposed từ QuickBuySection gốc (vốn có tab Bán chạy/Mới nhất/Phổ biến dựa
// trên soldCount giả) — dữ liệu thật không có số lượng đã bán, nên chỉ còn lại
// đúng phần dữ liệu thật: sản phẩm mới nhất (published_at desc, thứ tự mặc định
// từ listStorefrontProducts).
export default function QuickBuySection({ products }: { products: StorefrontProductSummary[] }) {
  if (products.length === 0) return null;

  return (
    <section id="featured" className="scroll-mt-40 bg-white px-3.5 pb-2 pt-9 first:pt-7 lg:px-0 lg:pt-11 lg:first:pt-6">
      <div className="z-10 mb-3 border-t border-shop-border bg-white/95 pt-5 lg:border-t-0 lg:bg-transparent lg:pt-0">
        <span className="mb-2.5 block h-[3px] w-8 rounded-full bg-shop-primary" />
        <h2 className="text-[22px] font-extrabold leading-7 tracking-[-0.25px] text-black lg:text-[26px] lg:leading-8">
          Sản phẩm mới
        </h2>
        <p className="mt-0.5 pb-2 text-[13px] leading-5 text-shop-text-muted lg:text-[14px]">
          Vừa được cập nhật trên Denfood
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
