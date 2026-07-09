"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingCart, Search, User, LogOut, Package, ChevronDown } from "lucide-react";
import { useCart } from "./CartContext";
import { useCustomer } from "./CustomerContext";

export function Header() {
  const router = useRouter();
  const { totalQty } = useCart();
  const { customer, loading, logout } = useCustomer();
  const [search, setSearch] = useState("");
  const [storeName, setStoreName] = useState("Cửa hàng");
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
    <header className="sticky top-0 z-40 border-b bg-[var(--card)] shadow-soft">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/shop" className="shrink-0 text-lg font-semibold text-[var(--primary)]">
          {storeName}
        </Link>

        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm sản phẩm..."
            className="field pl-9"
          />
        </form>

        <Link
          href="/shop/cart"
          className="relative flex shrink-0 items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium hover:bg-[var(--accent)]"
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="hidden sm:inline">Giỏ hàng</span>
          {totalQty > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--destructive)] px-1 text-[11px] font-bold text-white">
              {totalQty}
            </span>
          )}
        </Link>

        <div className="relative shrink-0">
          {loading ? null : customer ? (
            <>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium hover:bg-[var(--accent)]"
              >
                <User className="h-5 w-5" />
                <span className="hidden sm:inline">{customer.name.split(" ")[0]}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <>
                  <button className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-label="Đóng menu" />
                  <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-md border bg-[var(--card)] py-1 shadow-elegant">
                    <Link
                      href="/shop/account"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--accent)]"
                    >
                      <User className="h-4 w-4" /> Tài khoản
                    </Link>
                    <Link
                      href="/shop/account/orders"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--accent)]"
                    >
                      <Package className="h-4 w-4" /> Đơn hàng của tôi
                    </Link>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        void logout().then(() => router.push("/shop"));
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--destructive)] hover:bg-[var(--accent)]"
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
              className="flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
            >
              <User className="h-4 w-4" />
              <span>Đăng nhập</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
