"use client";

import Link from "next/link";
import {
  ADDRESS,
  MAPS_URL,
  PHONE,
  PHONE_DISPLAY,
  ZALO_URL,
} from "@/components/shop/constants";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-shop-border bg-gradient-to-b from-white via-pink-50/30 to-purple-50/40 px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-12 text-[13.5px] text-shop-text-muted lg:pb-16 lg:pt-16">
      <div className="mx-auto max-w-[1320px]">
        {/* Lưới 4 cột cân đối tuyệt đối */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
          
          {/* Cột 1: Logo Siêu to rõ & Slogan */}
          <div className="space-y-4 flex flex-col">
            <div>
              <svg viewBox="0 0 680 220" className="h-16 w-auto overflow-visible drop-shadow-sm">
                <defs>
                  <linearGradient id="logoGradFooterPro" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6C5CE7"/>
                    <stop offset="55%" stopColor="#4C6FFF"/>
                    <stop offset="100%" stopColor="#FF6FA5"/>
                  </linearGradient>
                </defs>
                <g transform="translate(40,40)">
                  <rect x="0" y="0" width="116" height="116" rx="36" fill="url(#logoGradFooterPro)" />
                  <path d="M58 58 L27 33 Q20 58 27 83 Z" fill="#ffffff" />
                  <path d="M58 58 L89 33 Q96 58 89 83 Z" fill="#ffffff" />
                  <rect x="47" y="42" width="22" height="32" rx="7" fill="#ffffff" />
                  <circle cx="58" cy="58" r="9" fill="url(#logoGradFooterPro)" />
                  <path d="M98 14 l4 11 11 4 -11 4 -4 11 -4 -11 -11 -4 11 -4z" fill="#FFD166" />
                </g>
                <text x="175" y="120" fontFamily="Poppins, 'Arial Rounded MT Bold', Arial, sans-serif" fontWeight="800" fontSize="72" fill="url(#logoGradFooterPro)" letterSpacing="-1">Mabuu</text>
                <text x="178" y="165" fontFamily="Poppins, Arial, sans-serif" fontWeight="700" fontSize="26" fill="#14161F" letterSpacing="11">STORE</text>
              </svg>
            </div>
            <div className="space-y-2.5">
              <p className="text-[14.5px] font-black uppercase tracking-wide text-shop-primary">
                SỈ PHỤ KIỆN, VĂN PHÒNG PHẨM - Xuất hóa đơn điện tử
              </p>
              <ul className="space-y-1.5 text-[13px] font-semibold text-shop-text-muted">
                <li className="flex items-center gap-2">
                  <span className="text-shop-primary font-bold">✓</span> Sỉ phụ kiện, văn phòng phẩm giá tốt
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-shop-primary font-bold">✓</span> Sale xác nhận qua Zalo trực tiếp
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-shop-primary font-bold">✓</span> Đặt hàng tiện lợi
                </li>
              </ul>
            </div>
          </div>

          {/* Cột 2: Liên hệ */}
          <div className="space-y-3.5 flex flex-col">
            <h3 className="text-[12px] font-black uppercase tracking-[0.15em] text-black">Tổng đài liên hệ</h3>
            <p className="text-[30px] font-black leading-tight tracking-tight text-shop-primary lg:text-[34px]">
              {PHONE_DISPLAY}
            </p>
            <div className="flex flex-col gap-2.5 pt-1">
              <a
                href={ZALO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full max-w-[240px] items-center justify-center gap-2 rounded-xl bg-shop-primary text-[13.5px] font-black text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)] transition-all duration-200 hover:bg-shop-primary-dark active:scale-95"
              >
                💬 Chat Zalo Tư Vấn
              </a>
              <a
                href={`tel:${PHONE}`}
                className="inline-flex h-11 w-full max-w-[240px] items-center justify-center gap-2 rounded-xl bg-black text-[13.5px] font-black text-white shadow-sm transition-all duration-200 hover:bg-gray-800 active:scale-95"
              >
                📞 Gọi Hotline Ngay
              </a>
            </div>
            <p className="text-[12.5px] font-medium text-shop-text-muted">Hỗ trợ khách hàng: 8:00 - 22:00</p>
          </div>

          {/* Cột 3: Địa chỉ cửa hàng */}
          <div className="space-y-3.5 flex flex-col">
            <h3 className="text-[12px] font-black uppercase tracking-[0.15em] text-black">Địa chỉ kho & cửa hàng</h3>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl bg-shop-primary text-white shadow-md">
                📍
              </span>
              <div className="space-y-2">
                <p className="text-[13.5px] font-bold leading-relaxed text-black">
                  {ADDRESS}
                </p>
                <p className="text-[12px] font-semibold text-shop-text-muted">Quận Bình Tân, TP. Hồ Chí Minh</p>
                <a
                  href={MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-shop-border bg-white px-3.5 text-[12px] font-bold text-shop-primary shadow-sm transition-all hover:border-shop-primary hover:bg-shop-primary-light/20 active:scale-95"
                >
                  🗺️ Xem bản đồ Google Maps
                </a>
              </div>
            </div>
          </div>

          {/* Cột 4: Kênh chính thức (2 ô nhỏ gọn, có điểm nhấn màu sắc sinh động) */}
          <div className="space-y-3.5 flex flex-col">
            <h3 className="text-[12px] font-black uppercase tracking-[0.15em] text-black">KÊNH KẾT NỐI CHÍNH THỨC</h3>
            <div className="flex flex-col gap-2.5 pt-1">
              <a
                href={ZALO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex h-10 w-[150px] items-center justify-between rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/60 to-white px-4 text-[13.5px] font-black text-black shadow-xs transition-all duration-200 hover:border-blue-500 hover:text-blue-600 hover:shadow-md active:scale-95"
              >
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-blue-500 animate-pulse"></span>
                  Zalo
                </span>
                <span className="text-xs font-bold text-blue-400 group-hover:translate-x-0.5 transition-transform">→</span>
              </a>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex h-10 w-[150px] items-center justify-between rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50/60 to-white px-4 text-[13.5px] font-black text-black shadow-xs transition-all duration-200 hover:border-orange-500 hover:text-orange-600 hover:shadow-md active:scale-95"
              >
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-orange-500"></span>
                  Google
                </span>
                <span className="text-xs font-bold text-orange-400 group-hover:translate-x-0.5 transition-transform">→</span>
              </a>
            </div>
          </div>

        </div>

        {/* Thanh Bản quyền phía dưới */}
        <div className="mt-12 border-t border-shop-border/80 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] font-semibold text-shop-text-muted">
          <p>© 2026 MABUU Store. Tất cả các quyền được bảo lưu.</p>
          <div className="flex items-center gap-5">
            <span className="transition-colors hover:text-shop-primary cursor-pointer">Chính sách mua sỉ</span>
            <span>•</span>
            <span className="transition-colors hover:text-shop-primary cursor-pointer">Quy định đổi trả</span>
            <span>•</span>
            <span className="transition-colors hover:text-shop-primary cursor-pointer">Hóa đơn điện tử VAT</span>
          </div>
        </div>
      </div>
    </footer>
  );
}