"use client";

// app/page.tsx
// Trang chủ: Hero carousel tự động, danh mục nổi bật, sản phẩm mới nhất

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";
import { products } from "@/data/mockData";
import ProductCard from "@/components/ProductCard";

const heroSlides = [
  {
    image: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=1600&q=80",
    tag: "Bộ Sưu Tập 2026",
    title: "Gọn Gàng Mỗi Ngày, Tinh Tế Mọi Khoảnh Khắc",
    desc: "Đồ dùng văn phòng và phụ kiện tóc được chọn lọc kỹ lưỡng — nơi sự gọn gàng gặp gỡ phong cách tinh tế mỗi ngày.",
  },
  {
    image: "https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?w=1600&q=80",
    tag: "Ưu Đãi Đặc Biệt",
    title: "Sổ Tay & Văn Phòng Phẩm Cao Cấp",
    desc: "Nâng tầm không gian làm việc với những thiết kế tinh xảo, chất liệu bền đẹp theo thời gian.",
  },
  {
    image: "https://images.unsplash.com/photo-1620921575047-ec7ef0e50aeb?w=1600&q=80",
    tag: "Xu Hướng Mới",
    title: "Phụ Kiện Tóc Phong Cách Vintage",
    desc: "Tôn lên vẻ đẹp của bạn với những phụ kiện tóc được yêu thích nhất mùa này.",
  },
];

const categoryBanners = [
  {
    name: "Đồ Dùng Văn Phòng",
    image: "https://images.unsplash.com/photo-1517971071642-34a2d3ecc9cd?w=700&q=80",
  },
  {
    name: "Phụ Kiện Tóc",
    image: "https://images.unsplash.com/photo-1564624791497-06ce5d1643ec?w=700&q=80",
  },
  {
    name: "Trang Trí Bàn Làm Việc",
    image: "https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=700&q=80",
  },
];

export default function HomePage() {
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % heroSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const newestProducts = [...products]
    .filter((p) => p.isNew || p.isFeatured)
    .slice(0, 8);

  return (
    <div>
      {/* Hero Carousel */}
      <section className="relative overflow-hidden bg-[#1A365D] h-[480px] md:h-[560px]">
        {heroSlides.map((slide, idx) => (
          <div
            key={idx}
            className={`absolute inset-0 transition-opacity duration-1000 ${
              idx === slideIndex ? "opacity-100 z-10" : "opacity-0 z-0"
            }`}
          >
            <div className="absolute inset-0 opacity-20">
              <Image
                src={slide.image}
                alt={slide.title}
                fill
                priority={idx === 0}
                className="object-cover"
              />
            </div>
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 h-full flex items-center">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[#C9A24B] text-xs font-semibold tracking-widest uppercase">
                  <Sparkles className="w-3.5 h-3.5" /> {slide.tag}
                </span>
                <h1 className="mt-5 text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight">
                  {slide.title}
                </h1>
                <p className="mt-4 text-white/70 text-base md:text-lg leading-relaxed">
                  {slide.desc}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/products"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#C9A24B] text-[#1A365D] font-semibold text-sm hover:bg-[#dbb35e] transition-colors"
                  >
                    Khám Phá Ngay <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/products"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white font-semibold text-sm hover:bg-white/20 transition-colors"
                  >
                    Xem Bộ Sưu Tập
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Dấu chấm chuyển slide */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {heroSlides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setSlideIndex(idx)}
              aria-label={`Chuyển đến slide ${idx + 1}`}
              className={`h-2 rounded-full transition-all ${
                idx === slideIndex ? "w-6 bg-[#C9A24B]" : "w-2 bg-white/40"
              }`}
            />
          ))}
        </div>
      </section>

      {/* Category Banners */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#1A365D]">Danh Mục Nổi Bật</h2>
            <p className="text-gray-500 mt-1.5 text-sm">Chọn phong cách phù hợp với bạn</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {categoryBanners.map((cat) => (
            <Link
              key={cat.name}
              href={`/products?category=${encodeURIComponent(cat.name)}`}
              className="group relative rounded-2xl overflow-hidden aspect-[4/5] shadow-sm hover:shadow-lg transition-shadow"
            >
              <Image
                src={cat.image}
                alt={cat.name}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1A365D]/80 via-[#1A365D]/10 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5">
                <h3 className="text-white text-lg font-semibold">{cat.name}</h3>
                <span className="inline-flex items-center gap-1.5 text-[#C9A24B] text-sm font-medium mt-1.5 group-hover:gap-2.5 transition-all">
                  Xem thêm <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Newest Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 md:pb-24">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#1A365D]">Sản Phẩm Mới Nhất</h2>
            <p className="text-gray-500 mt-1.5 text-sm">Cập nhật những thiết kế mới nhất từ TIME TECH</p>
          </div>
          <Link
            href="/products"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-[#1A365D] hover:text-[#C9A24B] transition-colors"
          >
            Xem tất cả <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {newestProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}