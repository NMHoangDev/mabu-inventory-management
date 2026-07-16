"use client";

// app/wishlist/page.tsx
// Trang sản phẩm yêu thích

import Link from "next/link";
import { Heart } from "lucide-react";
import { products } from "@/data/mockData";
import { useWishlist } from "@/context/WishlistContext";
import ProductCard from "@/components/ProductCard";

export default function WishlistPage() {
  const { wishlist } = useWishlist();
  const wishlistedProducts = products.filter((p) => wishlist.includes(p.id));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-[#1A365D]">Sản Phẩm Yêu Thích</h1>
        <p className="text-gray-500 mt-1.5 text-sm">
          {wishlistedProducts.length} sản phẩm đã lưu
        </p>
      </div>

      {wishlistedProducts.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {wishlistedProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
          <Heart className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Bạn chưa có sản phẩm yêu thích nào.</p>
          <Link
            href="/products"
            className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-[#1A365D] text-white text-sm font-medium hover:bg-[#142c4a]"
          >
            Khám phá sản phẩm
          </Link>
        </div>
      )}
    </div>
  );
}