"use client";

import Link from "next/link";
import { ImageOff, Plus } from "lucide-react";
import { useCart } from "./CartContext";
import { fmtMoney } from "@/lib/storefront/format";
import type { StorefrontProductSummary } from "@/lib/storefront/catalog";

export function ProductCard({ product }: { product: StorefrontProductSummary }) {
  const { addItem } = useCart();
  const outOfStock = product.stock <= 0;

  return (
    <div className="panel flex flex-col overflow-hidden transition hover:shadow-elegant">
      <Link href={`/shop/products/${product.slug}`} className="block aspect-square bg-[var(--secondary)]">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--muted-foreground)]">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <Link href={`/shop/products/${product.slug}`} className="line-clamp-2 text-sm font-medium hover:text-[var(--primary)]">
          {product.name}
        </Link>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="text-base font-semibold text-[var(--primary)]">{fmtMoney(product.price)}</span>
          <button
            disabled={outOfStock}
            onClick={() =>
              addItem({
                product_id: product.id,
                name: product.name,
                slug: product.slug,
                unit: product.unit,
                price: product.price,
                image_url: product.image_url,
              })
            }
            title={outOfStock ? "Hết hàng" : "Thêm vào giỏ"}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {outOfStock && <span className="text-xs text-[var(--destructive)]">Hết hàng</span>}
      </div>
    </div>
  );
}
