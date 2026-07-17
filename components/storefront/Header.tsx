"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingCart, Search, User, LogOut, Package, ChevronDown, Store } from "lucide-react";
import { useCart } from "./CartContext";
import { useCustomer } from "./CustomerContext";

export function Header() {
  const router = useRouter();
  const { totalQty } = useCart();
  const { customer, loading, logout } = useCustomer();
  const [search, setSearch] = useState("");
  const [storeName, setStoreName] = useState("Cửa Hàng");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/storefront/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d?.settings?.store_name) setStoreName(d.settings.store_name);
      })
      .catch(() => undefined);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(search.trim() ? `/shop/products?search=${encodeURIComponent(search.trim())}` : "/shop/products");
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur-md shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/shop" className="shrink-0 flex items-center gap-2 text-xl font-bold text-slate-800 transition-colors hover:text-[var(--primary)]">
          <Store className="h-6 w-6 text-[var(--primary)]" />
          {storeName}
        </Link>

        {/* Main Navigation */}
        <nav className="hidden md:flex items-center gap-6 font-medium text-slate-600">
          <Link href="/shop" className="hover:text-[var(--primary)] transition-colors">Trang chủ</Link>
          <Link href="/shop/products" className="hover:text-[var(--primary)] transition-colors">Sản phẩm</Link>
          <Link href="/shop/about" className="hover:text-[var(--primary)] transition-colors">Giới thiệu</Link>
          <Link href="/shop/contact" className="hover:text-[var(--primary)] transition-colors">Liên hệ</Link>
        </nav>

        <form onSubmit={handleSearch} className="relative flex-1 max-w-xs ml-auto hidden sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm sản phẩm..."
            className="w-full border border-slate-200 bg-slate-50 rounded-full pl-9 pr-4 py-2 text-sm outline-none transition-all focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 focus:bg-white"
          />
        </form>

        <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
          <Link
            href="/shop/cart"
            className="relative flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="hidden lg:inline">Giỏ hàng</span>
            {totalQty > 0 && (
              <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[11px] font-bold text-white shadow-sm ring-2 ring-white">
                {totalQty}
              </span>
            )}
          </Link>

          <div className="relative shrink-0">
            {loading ? null : customer ? (
              <>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
                >
                  <User className="h-5 w-5 text-slate-500" />
                  <span className="hidden sm:inline">{customer.name.split(" ")[0]}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
                {menuOpen && (
                  <>
                    <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Đóng menu" />
                    <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-slate-200 bg-white py-2 shadow-elegant origin-top-right animate-in fade-in zoom-in-95">
                      <div className="px-4 py-2 border-b border-slate-100 mb-1">
                        <p className="text-xs font-semibold text-slate-500">Tài khoản của</p>
                        <p className="text-sm font-bold text-slate-800 truncate">{customer.name}</p>
                      </div>
                      <Link
                        href="/shop/account"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-[var(--primary)] transition-colors"
                      >
                        <User className="h-4 w-4" /> Thông tin tài khoản
                      </Link>
                      <Link
                        href="/shop/account/orders"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-[var(--primary)] transition-colors"
                      >
                        <Package className="h-4 w-4" /> Đơn hàng của tôi
                      </Link>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          void logout().then(() => router.push("/shop"));
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors mt-1 border-t border-slate-100 pt-2"
                      >
                        <LogOut className="h-4 w-4" /> Đăng xuất
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <Link
                href="/shop/account/login"
                className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white shadow-soft hover:opacity-90 transition-opacity hover:-translate-y-0.5"
              >
                <User className="h-4 w-4" />
                <span>Đăng nhập</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
