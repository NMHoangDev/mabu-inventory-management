"use client";

import {
  ADDRESS,
  LOGO_WORDMARK,
  MAPS_URL,
  PHONE,
  PHONE_DISPLAY,
  SOCIAL_LINKS,
  ZALO_URL,
} from "@/components/shop/constants";

export default function Footer() {
  return (
    <footer className="mt-9 border-t border-shop-border bg-white px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-6 text-[13px] text-shop-text-muted lg:pb-8 lg:pt-8">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid gap-5 lg:grid-cols-4 lg:gap-8">
          <section className="space-y-3">
            <img src={LOGO_WORDMARK} alt="Denfood" className="h-auto w-[116px]" />
            <div>
              <p className="max-w-[260px] text-[15px] font-black uppercase leading-5 text-shop-primary">
                Đặt nhanh - Ăn ngon - Giá tốt
              </p>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-semibold leading-5 text-shop-text-muted lg:block lg:space-y-1.5">
                <li>✓ Giá web tốt hơn sàn</li>
                <li>✓ Sale xác nhận qua Zalo</li>
                <li>✓ Đặt hàng tiện lợi</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-black">Liên hệ</p>
            <p className="text-[32px] font-black leading-none tracking-[-0.03em] text-shop-primary lg:text-[36px]">
              {PHONE_DISPLAY}
            </p>
            <div className="grid max-w-[300px] grid-cols-2 gap-2">
              <a
                href={ZALO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-shop-primary px-3 text-[13px] font-black text-white shadow-[0_10px_20px_rgba(37,99,235,0.16)] transition hover:bg-shop-primary-dark lg:h-11 lg:text-[14px]"
              >
                Chat Zalo
              </a>
              <a
                href={`tel:${PHONE}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-black px-3 text-[13px] font-black text-white transition hover:bg-gray-900 lg:h-11 lg:text-[14px]"
              >
                Gọi ngay
              </a>
            </div>
            <p className="text-[13px] font-semibold text-shop-text-muted">Hỗ trợ: 8:00 - 22:00</p>
          </section>

          <section className="space-y-2.5 lg:space-y-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-black">Địa chỉ</p>
            <div className="flex max-w-[310px] items-start gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-shop-primary text-white shadow-[0_8px_18px_rgba(37,99,235,0.18)] lg:size-10">
                📍
              </span>
              <div className="min-w-0 space-y-2">
                <p className="text-[13.5px] font-black leading-5 text-black lg:text-[14px]">{ADDRESS}</p>
                <p className="text-[12.5px] font-semibold text-shop-text-muted">Hồ Chí Minh</p>
                <a
                  href={MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-shop-border bg-gray-50 px-3 text-[12.5px] font-black text-shop-primary transition hover:border-shop-primary/40 hover:bg-white"
                >
                  Xem Google Maps
                </a>
              </div>
            </div>
          </section>

          <section>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-black">Kênh chính thức</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-black text-black lg:grid lg:grid-cols-2 lg:gap-2">
              {SOCIAL_LINKS.map((link) => (
                <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" className="transition hover:text-shop-primary">
                  {link.name}
                </a>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-8 border-t border-shop-border pt-5">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-shop-text-muted">
            <span>© 2026 Denfood. Tất cả quyền được bảo lưu.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
