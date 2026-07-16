"use client";

// app/products/[id]/page.tsx
// Trang chi tiết sản phẩm: gallery ảnh, tiêu đề, giá, mô tả, chọn số lượng, thông số

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Star, Minus, Plus, ShoppingBag, ChevronLeft, ShieldCheck, Truck, RotateCcw } from "lucide-react";
import { getProductById, formatVND, products } from "@/data/mockData";
import { useCart } from "@/context/CartContext";
import ProductCard from "@/components/ProductCard";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addToCart } = useCart();
  const product = getProductById(params.id as string);

  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[#1A365D]">Không tìm thấy sản phẩm</h1>
        <p className="text-gray-500 mt-2">Sản phẩm bạn tìm không tồn tại hoặc đã bị gỡ bỏ.</p>
        <Link
          href="/products"
          className="inline-flex mt-6 px-6 py-3 rounded-xl bg-[#1A365D] text-white text-sm font-medium hover:bg-[#142c4a]"
        >
          Quay lại danh sách sản phẩm
        </Link>
      </div>
    );
  }

  const relatedProducts = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const handleAddToCart = () => {
    addToCart(product, quantity);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-14">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1A365D] mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Quay lại
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-14">
        {/* Gallery */}
        <div>
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
            <Image
              src={product.images[activeImage]}
              alt={product.name}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          </div>
          <div className="flex gap-3 mt-4">
            {product.images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setActiveImage(idx)}
                className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 transition-colors ${
                  activeImage === idx ? "border-[#1A365D]" : "border-transparent"
                }`}
              >
                <Image src={img} alt={`${product.name} ${idx + 1}`} fill sizes="80px" className="object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Info */}
        <div>
          {product.isNew && (
            <span className="inline-block px-2.5 py-1 rounded-full bg-[#1A365D]/10 text-[#1A365D] text-[11px] font-semibold tracking-wide mb-3">
              SẢN PHẨM MỚI
            </span>
          )}
          <h1 className="text-2xl md:text-3xl font-bold text-[#1A365D] leading-tight">{product.name}</h1>

          <div className="flex items-center gap-2 mt-3">
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < Math.round(product.rating) ? "fill-[#C9A24B] text-[#C9A24B]" : "text-gray-200"
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-gray-500">
              {product.rating} ({product.reviewCount} đánh giá)
            </span>
          </div>

          <div className="flex items-baseline gap-3 mt-5">
            <span className="text-3xl font-bold text-[#1A365D]">{formatVND(product.price)}</span>
            {product.originalPrice && (
              <span className="text-lg text-gray-400 line-through">{formatVND(product.originalPrice)}</span>
            )}
          </div>

          <p className="text-gray-600 leading-relaxed mt-5">{product.description}</p>

          {/* Quantity selector */}
          <div className="mt-7">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Số lượng</label>
            <div className="flex items-center gap-4">
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="p-3 hover:bg-[#F7FAFC] transition-colors"
                  aria-label="Giảm số lượng"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center text-sm font-semibold">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                  className="p-3 hover:bg-[#F7FAFC] transition-colors"
                  aria-label="Tăng số lượng"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <span className="text-sm text-gray-500">Còn {product.stock} sản phẩm</span>
            </div>
          </div>

          {/* Add to cart */}
          <button
            onClick={handleAddToCart}
            className={`mt-7 w-full flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] ${
              justAdded ? "bg-green-600 text-white" : "bg-[#1A365D] text-white hover:bg-[#142c4a]"
            }`}
          >
            <ShoppingBag className="w-5 h-5" />
            {justAdded ? "Đã thêm vào giỏ hàng!" : "Thêm vào giỏ hàng"}
          </button>

          {/* Trust row */}
          <div className="grid grid-cols-3 gap-3 mt-7 pt-7 border-t border-gray-100">
            <div className="flex flex-col items-center text-center gap-1.5">
              <Truck className="w-5 h-5 text-[#1A365D]" />
              <span className="text-xs text-gray-500">Giao hàng nhanh</span>
            </div>
            <div className="flex flex-col items-center text-center gap-1.5">
              <ShieldCheck className="w-5 h-5 text-[#1A365D]" />
              <span className="text-xs text-gray-500">Bảo hành chính hãng</span>
            </div>
            <div className="flex flex-col items-center text-center gap-1.5">
              <RotateCcw className="w-5 h-5 text-[#1A365D]" />
              <span className="text-xs text-gray-500">Đổi trả 7 ngày</span>
            </div>
          </div>

          {/* Specs */}
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-[#1A365D] mb-3">Thông Số Kỹ Thuật</h2>
            <dl className="rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {product.specs.map((spec) => (
                <div key={spec.label} className="flex justify-between px-4 py-3 bg-white text-sm">
                  <dt className="text-gray-500">{spec.label}</dt>
                  <dd className="font-medium text-gray-800">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* Related products */}
      {relatedProducts.length > 0 && (
        <div className="mt-16 md:mt-24">
          <h2 className="text-xl md:text-2xl font-bold text-[#1A365D] mb-6">Sản Phẩm Liên Quan</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
