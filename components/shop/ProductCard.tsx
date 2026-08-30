"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ImageOff, Plus, Minus, ShoppingCart } from "@/components/shop/icons";
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

  const [qty, setQty] = useState(1);

  const clampQty = (value: number) => {
    if (Number.isNaN(value) || value < 1) return 1;
    if (product.stock > 0 && value > product.stock) return product.stock;
    return Math.floor(value);
  };

  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = Number(e.target.value);
    setQty(clampQty(raw));
  };

  const handleQtyBlur = () => {
    setQty((q) => clampQty(q));
  };

  const step = (delta: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setQty((q) => clampQty(q + delta));
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock) return;

    addItem(
      {
        product_id: product.id,
        name: product.name,
        slug: product.slug,
        unit: product.unit,
        price: product.price,
        image_url: product.image_url,
        stock: product.stock,
      },
      qty
    );

    toast.success(`Đã thêm ${qty} ${product.unit} vào giỏ`, {
      duration: 1800,
      style: { background: "#111111", color: "#fff", borderRadius: "12px", fontSize: "13px", fontWeight: 600 },
    });

    setQty(1);
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

          <span className="truncate text-[11px] text-shop-text-muted">{product.unit}</span>

          {!outOfStock ? (
            <div className="mt-1 flex items-center justify-between gap-1.5">
              <div className="relative flex items-center overflow-hidden rounded-lg border-[1.5px] border-shop-primary/40 bg-shop-primary-light">
                <button
                  type="button"
                  onClick={step(-1)}
                  className="flex size-7 shrink-0 items-center justify-center text-shop-primary transition-colors hover:bg-shop-primary/10 active:scale-[0.94]"
                  aria-label="Giảm số lượng"
                >
                  <Minus size={13} strokeWidth={2.5} />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={product.stock || undefined}
                  value={qty}
                  onClick={(e) => e.preventDefault()}
                  onChange={handleQtyChange}
                  onBlur={handleQtyBlur}
                  className="w-11 border-x-[1.5px] border-shop-primary/40 bg-white py-1 px-1 text-center text-[14px] font-extrabold text-shop-primary outline-none [appearance:textfield] focus:bg-shop-primary/5 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={step(1)}
                  className="flex size-7 shrink-0 items-center justify-center text-shop-primary transition-colors hover:bg-shop-primary/10 active:scale-[0.94]"
                  aria-label="Tăng số lượng"
                >
                  <Plus size={13} strokeWidth={2.5} />
                </button>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                className="flex size-8 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-shop-primary bg-shop-primary text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.96]"
                aria-label={`Thêm ${product.name} vào giỏ`}
              >
                <ShoppingCart size={16} strokeWidth={2.3} />
              </button>
            </div>
          ) : (
            <div className="mt-1 flex items-end justify-end">
              <button
                type="button"
                disabled
                className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-300"
                aria-label={`${product.name} hết hàng`}
              >
                <ShoppingCart size={16} strokeWidth={2.3} />
              </button>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}