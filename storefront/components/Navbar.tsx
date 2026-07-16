"use client";

// components/Navbar.tsx
// Thanh điều hướng chính: logo, thanh tìm kiếm (hoạt động thật), menu, giỏ hàng, hồ sơ

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import { Search, ShoppingBag, User, Menu, X } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { STORE_NAME } from "@/data/mockData";

const navLinks = [
  { href: "/", label: "Trang Chủ" },
  { href: "/products", label: "Sản Phẩm" },
  { href: "/wishlist", label: "Yêu Thích" },
  { href: "/contact", label: "Liên Hệ" },
  { href: "/history", label: "Đơn Hàng" },
];

function SearchBox({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
  };

  return (
    <form onSubmit={handleSubmit} className={`relative w-full ${className}`}>
      <button
        type="submit"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1A365D]"
        aria-label="Tìm kiếm"
      >
        <Search className="w-4 h-4" />
      </button>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Tìm kiếm sản phẩm..."
        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#F7FAFC] border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] transition-all"
      />
    </form>
  );
}

export default function Navbar() {
  const { itemCount } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20 gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-xl md:text-2xl font-bold tracking-wide text-[#1A365D]">
              {STORE_NAME.split(" ")[0]}
              <span className="text-[#C9A24B]"> {STORE_NAME.split(" ").slice(1).join(" ")}</span>
            </span>
          </Link>

          <SearchBox className="hidden md:flex max-w-md" />

          <nav className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-gray-600 hover:text-[#1A365D] transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 md:gap-3">
            <Link
              href="/cart"
              className="relative p-2.5 rounded-xl hover:bg-[#F7FAFC] transition-colors"
              aria-label="Giỏ hàng"
            >
              <ShoppingBag className="w-5 h-5 text-[#1A365D]" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-[#C9A24B] rounded-full">
                  {itemCount > 9 ? "9+" : itemCount}
                </span>
              )}
            </Link>
            <Link
              href="/history"
              className="hidden sm:flex p-2.5 rounded-xl hover:bg-[#F7FAFC] transition-colors"
              aria-label="Hồ sơ"
            >
              <User className="w-5 h-5 text-[#1A365D]" />
            </Link>
            <button
              className="lg:hidden p-2.5 rounded-xl hover:bg-[#F7FAFC] transition-colors"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden pb-4 space-y-1 border-t border-gray-100 pt-3">
            <SearchBox className="mb-3 md:hidden" />
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-[#F7FAFC] hover:text-[#1A365D]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}