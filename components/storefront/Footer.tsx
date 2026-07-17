"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Store, Facebook, Instagram, Twitter } from "lucide-react";

export function Footer() {
  const [settings, setSettings] = useState<{ store_name: string; contact_phone: string; contact_address: string }>({
    store_name: "Cửa Hàng",
    contact_phone: "",
    contact_address: "",
  });

  useEffect(() => {
    fetch("/api/storefront/settings")
      .then((r) => r.json())
      .then((d) => d?.settings && setSettings(d.settings))
      .catch(() => undefined);
  }, []);

  return (
    <footer className="mt-auto border-t border-slate-200 bg-white pt-12 pb-8">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-4">
            <Link href="/shop" className="flex items-center gap-2 text-xl font-bold text-slate-800">
              <Store className="h-6 w-6 text-[var(--primary)]" />
              {settings.store_name}
            </Link>
            <p className="text-sm text-slate-500">
              Cung cấp các sản phẩm chất lượng cao với dịch vụ tốt nhất. Đồng hành cùng phong cách sống của bạn mỗi ngày.
            </p>
            <div className="flex items-center gap-4 text-slate-400">
              <a href="#" className="hover:text-[var(--primary)] transition-colors"><Facebook className="h-5 w-5" /></a>
              <a href="#" className="hover:text-[var(--primary)] transition-colors"><Instagram className="h-5 w-5" /></a>
              <a href="#" className="hover:text-[var(--primary)] transition-colors"><Twitter className="h-5 w-5" /></a>
            </div>
          </div>
          
          <div>
            <h3 className="font-bold text-slate-800 mb-4">Danh Mục</h3>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link href="/shop/products" className="hover:text-[var(--primary)] transition-colors">Tất cả sản phẩm</Link></li>
              <li><Link href="/shop/products?category=new" className="hover:text-[var(--primary)] transition-colors">Hàng mới về</Link></li>
              <li><Link href="/shop/products?category=sale" className="hover:text-[var(--primary)] transition-colors">Khuyến mãi</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-bold text-slate-800 mb-4">Hỗ Trợ</h3>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link href="/shop/about" className="hover:text-[var(--primary)] transition-colors">Về chúng tôi</Link></li>
              <li><Link href="/shop/contact" className="hover:text-[var(--primary)] transition-colors">Liên hệ</Link></li>
              <li><Link href="#" className="hover:text-[var(--primary)] transition-colors">Chính sách bảo mật</Link></li>
              <li><Link href="#" className="hover:text-[var(--primary)] transition-colors">Điều khoản dịch vụ</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-bold text-slate-800 mb-4">Liên Hệ</h3>
            <ul className="space-y-2 text-sm text-slate-500">
              {settings.contact_address ? (
                <li>{settings.contact_address}</li>
              ) : (
                <li>123 Phố Điện Tử, Quận 1, TP.HCM</li>
              )}
              {settings.contact_phone ? (
                <li>Hotline: {settings.contact_phone}</li>
              ) : (
                <li>Hotline: 1900 1234</li>
              )}
              <li>Email: hotro@cuahang.com</li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-slate-100 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-400">
          <div>© {new Date().getFullYear()} {settings.store_name}. Mọi quyền được bảo lưu.</div>
          <div className="flex gap-4">
            <span>Visa</span>
            <span>Mastercard</span>
            <span>Momo</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
