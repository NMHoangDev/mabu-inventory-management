"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useCartStore } from "@/store/shopCart";
import { fmtMoney } from "@/lib/storefront/format";
import { Plus, Minus, ShoppingCart } from "@/components/shop/icons";
import type { StorefrontProductDetail } from "@/lib/storefront/catalog";

export default function AddToCartButton({ product }: { product: StorefrontProductDetail }) {
  const [qty, setQty] = useState(1);
  const addItem = useCartStore((s) => s.addItem);
  const outOfStock = product.stock <= 0;

  const handleAdd = () => {
    if (outOfStock) return;
    for (let i = 0; i < qty; i++) {
      addItem({
        product_id: product.id,
        name: product.name,
        slug: product.slug,
        unit: product.unit,
        price: product.price,
        image_url: product.image_url,
        stock: product.stock,
      });
    }
    toast.success(`Đã thêm ${qty} sản phẩm vào giỏ!`, {
      duration: 2200,
      style: { background: "#0f172a", color: "#fff", borderRadius: "12px", fontSize: "14px" },
    });
  };

  if (outOfStock) {
    return (
      <button disabled className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-gray-200 py-4 text-base font-bold text-gray-400">
        Hết hàng
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-shop-text">Số lượng:</span>
        <div className="flex items-center overflow-hidden rounded-xl border-2 border-gray-200">
          <button onClick={() => setQty(Math.max(1, qty - 1))} className="flex h-10 w-10 items-center justify-center transition-colors hover:bg-gray-100">
            <Minus size={16} />
          </button>
          <span className="w-12 text-center font-bold text-shop-text">{qty}</span>
          <button
            onClick={() => setQty(Math.min(product.stock, qty + 1))}
            className="flex h-10 w-10 items-center justify-center transition-colors hover:bg-gray-100"
          >
            <Plus size={16} />
          </button>
        </div>
        <span className="text-sm text-shop-text-muted">= {fmtMoney(product.price * qty)}</span>
      </div>

      <button
        onClick={handleAdd}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-shop-primary py-4 text-base font-bold text-white shadow-lg shadow-blue-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-shop-primary-dark hover:shadow-blue-500/50"
      >
        <ShoppingCart size={20} />
        Thêm vào giỏ hàng
      </button>
    </div>
  );
}
