"use client";

import { useEffect, useState } from "react";
import { ArrowUp, MessageSquare } from "@/components/shop/icons";
import { ZALO_URL } from "@/components/shop/constants";

export default function StickyContactWidget() {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <>
      <div className="fixed bottom-[136px] right-4 z-[90] lg:bottom-6">
        <div className="relative">
          <div className="shop-btn-ripple absolute inset-0 rounded-full bg-shop-primary" />
          <a
            href={ZALO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shop-btn-shake relative grid size-[54px] place-items-center rounded-full bg-shop-primary text-white shadow-[0_4px_20px_rgba(37,99,235,0.45)] transition-transform active:scale-95"
            aria-label="Hỗ trợ trực tuyến"
          >
            <MessageSquare size={28} />
          </a>
        </div>
      </div>

      <div
        className={`pointer-events-none fixed inset-x-0 bottom-[76px] z-40 mx-auto max-w-md px-5 transition-all duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] lg:bottom-6 lg:left-auto lg:right-6 lg:max-w-none lg:px-0 ${
          showScrollTop ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={scrollToTop}
          className="pointer-events-auto ml-auto grid size-10 place-items-center rounded-full border border-shop-border bg-white/95 text-shop-primary shadow-md backdrop-blur"
          aria-label="Lên đầu trang"
        >
          <ArrowUp size={18} strokeWidth={2.4} />
        </button>
      </div>
    </>
  );
}
