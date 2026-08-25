"use client";

import Link from "next/link";
import toast from "react-hot-toast";
import { ImageOff, Plus } from "@/components/shop/icons";
import { useCartStore } from "@/store/shopCart";
import { fmtMoney } from "@/lib/storefront/format";
import type { StorefrontProductSummary } from "@/lib/storefront/catalog";

interface ProductCardProps {
  product: StorefrontProductSummary;
}

export default function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const outOfStock = product.stock <= 0;
  const hasDiscount = !!product.compare_at_price && product.compare_at_price > product.price;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock) return;
    addItem({
      product_id: product.id,
      name: product.name,
      slug: product.slug,
      unit: product.unit,
      price: product.price,
      image_url: product.image_url,
      stock: product.stock,
    });
    toast.success("Đã thêm vào giỏ", {
      duration: 1800,
      style: { background: "#111111", color: "#fff", borderRadius: "12px", fontSize: "13px", fontWeight: 600 },
    });
  };

  return (
    <div>
      <article className="h-full overflow-hidden rounded-[14px] border border-shop-border bg-white p-2 shadow-sm transition-[border-color,box-shadow,transform] hover:border-gray-300 hover:shadow-md">
        <Link
          href={`/shop/san-pham/${product.slug}`}
          className="relative block aspect-square min-h-[116px] overflow-hidden rounded-xl bg-gray-100"
          aria-label={`Xem chi tiết ${product.name}`}
        >
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-shop-text-muted">
              <ImageOff size={28} className="opacity-50" />
            </div>
          )}
          {outOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-red-600 shadow-sm">
                Hết hàng
              </span>
            </div>
          )}
        </Link>

        <div className="flex min-h-[110px] flex-col gap-1 px-1 pt-2">
          <Link
            href={`/shop/san-pham/${product.slug}`}
            className="line-clamp-2 min-h-[38px] text-sm font-semibold leading-[1.35] text-shop-text"
          >
            {product.name}
          </Link>

          <div className="mt-0.5">
            <p className="text-[20px] font-bold leading-6 tracking-[-0.4px] text-shop-primary">
              {fmtMoney(product.price)}
            </p>
            {hasDiscount && (
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-shop-text-muted line-through">
                  {fmtMoney(product.compare_at_price!)}
                </span>
                <span className="rounded-full bg-shop-primary-light px-2 py-[3px] text-[10.5px] font-bold leading-3 text-shop-primary">
                  Tiết kiệm {fmtMoney(product.compare_at_price! - product.price)}
                </span>
              </div>
            )}
          </div>

          <div className="mt-auto flex items-end justify-between pt-1">
            <span className="truncate text-[11px] text-shop-text-muted">{product.unit}</span>
            <button
              type="button"
              onClick={handleAdd}
              disabled={outOfStock}
              className="ml-auto flex size-8 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-shop-primary bg-white text-shop-primary transition-all hover:bg-shop-primary hover:text-white active:scale-[0.96] disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-white"
              aria-label={`Thêm ${product.name}`}
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
