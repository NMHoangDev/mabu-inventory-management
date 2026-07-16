"use client";

// components/ProductCard.tsx
// Card sản phẩm với hover effect, nút yêu thích, "Thêm vào giỏ" và "Mua Ngay"

import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Star, ShoppingBag, Heart, Zap } from "lucide-react";
import { Product } from "@/types";
import { formatVND } from "@/data/mockData";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";

export default function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const { addToCart, buyNow } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const liked = isWishlisted(product.id);

  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    buyNow(product, 1);
    router.push("/checkout");
  };

  return (
    <div className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col">
      <div className="relative">
        <Link
          href={`/products/${product.id}`}
          className="block aspect-square overflow-hidden bg-[#F7FAFC]"
        >
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
          {product.isNew && (
            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[#1A365D] text-white text-[11px] font-semibold tracking-wide">
              MỚI
            </span>
          )}
          {product.originalPrice && (
            <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-[#C9A24B] text-white text-[11px] font-semibold tracking-wide">
              SALE
            </span>
          )}
        </Link>

        <button
          onClick={(e) => {
            e.preventDefault();
            toggleWishlist(product.id);
          }}
          aria-label={liked ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
          className="absolute top-3 right-3 p-2 rounded-full bg-white/90 shadow hover:scale-110 active:scale-95 transition-all duration-200"
        >
          <Heart
            className={`w-4 h-4 transition-all duration-300 ${
              liked ? "fill-red-500 text-red-500 scale-125" : "text-gray-400 scale-100"
            }`}
          />
        </button>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <Link href={`/products/${product.id}`}>
          <h3 className="text-sm font-semibold text-gray-800 line-clamp-2 hover:text-[#1A365D] transition-colors min-h-[2.5rem]">
            {product.name}
          </h3>
        </Link>

        <div className="flex items-center gap-1 mt-1.5">
          <Star className="w-3.5 h-3.5 fill-[#C9A24B] text-[#C9A24B]" />
          <span className="text-xs text-gray-500">
            {product.rating} ({product.reviewCount})
          </span>
        </div>

        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-base font-bold text-[#1A365D]">{formatVND(product.price)}</span>
          {product.originalPrice && (
            <span className="text-xs text-gray-400 line-through">{formatVND(product.originalPrice)}</span>
          )}
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <button
            onClick={() => addToCart(product, 1)}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-[#1A365D] text-[#1A365D] text-xs sm:text-sm font-medium hover:bg-[#1A365D]/5 active:scale-[0.98] transition-all"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Thêm vào giỏ</span>
            <span className="sm:hidden">Thêm giỏ</span>
          </button>
          <button
            onClick={handleBuyNow}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#1A365D] text-white text-xs sm:text-sm font-medium hover:bg-[#142c4a] active:scale-[0.98] transition-all"
          >
            <Zap className="w-4 h-4" />
            Mua Ngay
          </button>
        </div>
      </div>
    </div>
  );
}