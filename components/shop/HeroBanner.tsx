"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { BANNERS } from "@/components/shop/constants";

export default function HeroBanner() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 4000, stopOnInteraction: false }),
  ]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

  return (
    <section className="mx-4 mt-2 rounded-[18px] border border-shop-border bg-white p-1.5 shadow-sm lg:mx-0 lg:mt-0 lg:rounded-2xl lg:p-2">
      {/* Mobile carousel */}
      <div className="lg:hidden">
        <div ref={emblaRef} className="overflow-hidden">
          <div className="flex snap-x snap-mandatory gap-2">
            {BANNERS.map((banner, i) => (
              <article
                key={i}
                className="relative aspect-[2/1] w-full shrink-0 snap-center overflow-hidden rounded-[14px] bg-gradient-to-br from-shop-primary-light to-white"
              >
                <img src={banner.src} alt={banner.alt} className="h-full w-full object-contain" />
              </article>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex justify-center gap-1">
          {BANNERS.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Xem banner ${i + 1}`}
              onClick={() => scrollTo(i)}
              className={`h-1 rounded-full transition-all ${i === selectedIndex ? "w-6 bg-shop-primary" : "w-2 bg-shop-border"}`}
            />
          ))}
        </div>
      </div>

      {/* Desktop grid */}
      <div className="hidden lg:grid lg:grid-cols-[2fr_1fr] lg:gap-2">
        <article className="relative aspect-[2/1] overflow-hidden rounded-2xl bg-gradient-to-br from-shop-primary-light to-white">
          <img src={BANNERS[0].src} alt={BANNERS[0].alt} className="h-full w-full object-contain" />
        </article>
        <div className="grid grid-rows-2 gap-2">
          {BANNERS.slice(1).map((banner, i) => (
            <article key={i} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-shop-primary-light to-white">
              <img src={banner.src} alt={banner.alt} className="h-full w-full object-contain" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
