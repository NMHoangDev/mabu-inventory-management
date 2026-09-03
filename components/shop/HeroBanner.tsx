"use client";

import { BANNERS } from "@/components/shop/constants";

export default function HeroBanner() {
  if (!BANNERS || (BANNERS as readonly any[]).length === 0) return null;

  const mainBanner = BANNERS[0];

  return (
    <section className="mx-4 mt-2 w-full max-w-[1280px] lg:mx-auto lg:mt-0">
      <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-shop-border bg-[#FFF0F3] shadow-sm flex items-center justify-center">
        <img
          src={mainBanner.src}
          alt={mainBanner.alt}
          className="h-full w-full object-contain object-center"
        />
      </div>
    </section>
  );
}