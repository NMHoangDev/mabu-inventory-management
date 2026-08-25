"use client";

import { LOGO_ICON, PHONE_DISPLAY, ZALO_URL } from "@/components/shop/constants";

export default function MobileBottomBar() {
  const scrollToFeatured = () => {
    const el = document.getElementById("featured");
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 140;
      window.scrollTo({ top, behavior: "smooth" });
    } else {
      window.location.href = "/shop";
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-4 pb-[max(0.45rem,env(safe-area-inset-bottom))] lg:hidden">
      <div className="rounded-[18px] border border-gray-800 bg-[#111111] px-2 py-1.5 text-white shadow-lg">
        <div className="flex items-center gap-2.5">
          <a
            href={ZALO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="relative grid size-8 shrink-0 overflow-hidden rounded-[13px] border border-white/15 bg-white"
            aria-label="Chat Zalo"
          >
            <img src={LOGO_ICON} alt="Denfood" className="h-full w-full object-cover" />
          </a>
          <a href={ZALO_URL} target="_blank" rel="noopener noreferrer" className="block min-w-0 flex-1 text-left">
            <p className="truncate text-[11px] font-medium leading-4 text-white/60">Cần tư vấn?</p>
            <p className="truncate text-[15px] font-bold leading-5 tracking-[-0.2px] text-white">{PHONE_DISPLAY}</p>
          </a>
          <button
            type="button"
            onClick={scrollToFeatured}
            className="h-10 rounded-[14px] bg-shop-primary px-3.5 text-[13px] font-bold shadow-[0_6px_14px_rgba(37,99,235,0.22)]"
          >
            Xem món hôm nay
          </button>
        </div>
      </div>
    </div>
  );
}
