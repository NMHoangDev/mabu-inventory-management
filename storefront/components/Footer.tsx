"use client";

// components/Footer.tsx
// Chân trang: giới thiệu thương hiệu, liên kết nhanh, đăng ký nhận tin

import Link from "next/link";
import { Instagram, Facebook, Youtube } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[#1A365D] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <span className="text-xl font-bold tracking-wide">
              TIME<span className="text-[#C9A24B]"> TECH</span>
            </span>
            <p className="mt-4 text-sm text-white/70 leading-relaxed max-w-sm">
              TIME TECH mang đến đồ dùng văn phòng và phụ kiện tóc được chọn
              lọc kỹ lưỡng — gọn gàng mỗi ngày, tinh tế mọi khoảnh khắc.
            </p>
            <div className="flex items-center gap-3 mt-5">
              <a href="#" aria-label="Facebook" className="p-2 rounded-lg bg-white/10 hover:bg-[#C9A24B] transition-colors">
                <Facebook className="w-4 h-4" />
              </a>
              <a href="#" aria-label="Instagram" className="p-2 rounded-lg bg-white/10 hover:bg-[#C9A24B] transition-colors">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="#" aria-label="Youtube" className="p-2 rounded-lg bg-white/10 hover:bg-[#C9A24B] transition-colors">
                <Youtube className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-[#C9A24B]">
              Liên Kết Nhanh
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-white/70">
              <li><Link href="/products" className="hover:text-white transition-colors">Sản phẩm</Link></li>
              <li><Link href="/wishlist" className="hover:text-white transition-colors">Yêu thích</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors">Về chúng tôi</Link></li>
              <li><Link href="/history" className="hover:text-white transition-colors">Đơn hàng của tôi</Link></li>
              <li><Link href="/cart" className="hover:text-white transition-colors">Giỏ hàng</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-[#C9A24B]">
              Đăng Ký Nhận Tin
            </h4>
            <p className="mt-4 text-sm text-white/70">
              Nhận ưu đãi và bộ sưu tập mới nhất từ TIME TECH.
            </p>
            <form className="mt-4 flex gap-2" onSubmit={(e) => e.preventDefault()}>
              <input
                type="email"
                placeholder="Email của bạn"
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-sm placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#C9A24B]"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-[#C9A24B] text-[#1A365D] text-sm font-semibold hover:bg-[#dbb35e] transition-colors shrink-0"
              >
                Gửi
              </button>
            </form>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 text-xs text-white/50 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; {new Date().getFullYear()} TIME TECH. Đã đăng ký bản quyền.</span>
          <span>Thiết kế với sự tận tâm dành cho phong cách gọn gàng, tinh tế.</span>
        </div>
      </div>
    </footer>
  );
}