"use client";

import Link from "next/link";
import { ImageOff, Plus, ShoppingBag } from "lucide-react";
import { useCart } from "./CartContext";
import { fmtMoney } from "@/lib/storefront/format";
import type { StorefrontProductSummary } from "@/lib/storefront/catalog";

export function ProductCard({ product }: { product: StorefrontProductSummary }) {
  const { addItem } = useCart();
  const outOfStock = product.stock <= 0;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl bg-white transition-all duration-300 hover:shadow-elegant border border-[var(--border)] hover:-translate-y-1 hover:border-[var(--primary)]">
      <Link href={`/shop/products/${product.slug}`} className="block aspect-square overflow-hidden bg-[var(--secondary)] relative">
        {product.image_url ? (
          <img 
            src={product.image_url} 
            alt={product.name} 
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" 
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--muted-foreground)]">
            <ImageOff className="h-8 w-8 opacity-50" />
          </div>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] flex items-center justify-center">
            <span className="bg-white px-3 py-1 text-xs font-bold text-[var(--destructive)] rounded-full shadow-sm uppercase tracking-wider">Hết hàng</span>
          </div>
        )}
      </Link>
      
      <div className="flex flex-1 flex-col p-4 relative z-10 bg-white">
        <Link href={`/shop/products/${product.slug}`} className="line-clamp-2 text-sm font-semibold leading-tight text-slate-800 transition-colors group-hover:text-[var(--primary)]">
          {product.name}
        </Link>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-lg font-bold text-[var(--primary)] tracking-tight">{fmtMoney(product.price)}</span>
          </div>
          <button
            disabled={outOfStock}
            onClick={(e) => {
              e.preventDefault();
              addItem({
                product_id: product.id,
                name: product.name,
                slug: product.slug,
                unit: product.unit,
                price: product.price,
                image_url: product.image_url,
              });
            }}
            title={outOfStock ? "Hết hàng" : "Thêm vào giỏ"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-soft transition-all duration-300 hover:scale-110 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            <ShoppingBag className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
