"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Search,
  ShoppingCart,
  Settings,
  Table2,
  X
} from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";

const navItems = [
  { key: "dashboard", path: "/", label: "Dashboard", group: "Tổng quan", icon: LayoutDashboard },
  { key: "scan", path: "/scan", label: "Scan & tài liệu", group: "Hóa đơn", icon: FileSpreadsheet },
  { key: "summary", path: "/summary", label: "Tổng hợp hóa đơn", group: "Hóa đơn", icon: Table2 },
  { 
    key: "products", path: "/products", label: "Sản phẩm / SKU", group: "Vận hành", icon: Package,
    subItems: [
      { key: "product-list", path: "/products", label: "Danh sách sản phẩm" },
      { key: "product-categories", path: "/products/categories", label: "Danh mục sản phẩm" },
      { key: "product-pricing", path: "/products/pricing", label: "Bảng giá" }
    ]
  },
  { key: "inventory", path: "/inventory", label: "Tồn kho", group: "Vận hành", icon: Boxes },
  { key: "sales", path: "/sales", label: "Lên đơn hàng", group: "Vận hành", icon: ShoppingCart },
  { key: "reports", path: "/reports", label: "Báo cáo", group: "Vận hành", icon: BarChart3 },
  { key: "settings", path: "/settings", label: "Cài đặt", group: "Hệ thống", icon: Settings },
  { key: "blueprint", path: "/blueprint", label: "Design Blueprint", group: "Hệ thống", icon: FileText }
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { store, error, notice, setError, setNotice } = useApp();

  let currentNav = navItems.find((item) => item.path === pathname) ?? navItems[0];
  if (!navItems.find((item) => item.path === pathname)) {
    for (const item of navItems) {
      if (item.subItems) {
        const subItem = item.subItems.find((sub) => sub.path === pathname);
        if (subItem) {
          currentNav = { ...item, label: subItem.label };
          break;
        }
      }
    }
  }
  const navGroups = Array.from(new Set(navItems.map((item) => item.group)));
  const errorDocuments = store.documents.filter((doc) => doc.status === "error").length;

  const renderSidebar = (isCollapsed: boolean) => (
    <div className="flex h-full flex-col">
      <div className={`flex h-14 shrink-0 items-center border-b border-sidebar-border ${isCollapsed ? "justify-center" : "px-5"} transition-all`}>
        {isCollapsed ? (
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <LayoutDashboard className="h-4 w-4" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <div className="font-bold tracking-tight text-sidebar-foreground">InvoiceFlow</div>
          </div>
        )}
      </div>

      <nav className={`flex-1 overflow-y-auto ${isCollapsed ? "px-2" : "px-3"} py-4`}>
        {navGroups.map((group) => (
          <div key={group} className="mb-6 last:mb-0">
            {!isCollapsed ? (
              <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground opacity-50">{group}</div>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border opacity-60" />
            )}
            <div className="space-y-0.5">
              {navItems
                .filter((item) => item.group === group)
                .map((item) => {
                  const Icon = item.icon;
                  const activePath = pathname === item.path;
                  const hasActiveSub = item.subItems?.some((sub) => pathname === sub.path);
                  const active = activePath || hasActiveSub;
                  return (
                    <div key={item.key}>
                      <Link
                        href={item.path}
                        onClick={() => setMobileOpen(false)}
                        title={isCollapsed ? item.label : undefined}
                        className={`group relative flex items-center rounded-lg text-sm transition-all duration-200 ${
                          isCollapsed ? "mx-auto h-9 w-9 justify-center" : "gap-2.5 px-2.5 py-1.5"
                        } ${
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm"
                            : "text-sidebar-foreground opacity-75 hover:bg-sidebar-accent hover:opacity-100 hover:text-sidebar-accent-foreground"
                        }`}
                      >
                        {active && !isCollapsed ? <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-r bg-sidebar-primary" /> : null}
                        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-sidebar-primary" : ""}`} />
                        {!isCollapsed ? <span className="truncate">{item.label}</span> : null}
                      </Link>

                      {!isCollapsed && item.subItems && (active || hasActiveSub || pathname.startsWith(item.path)) ? (
                        <div className="mt-1 ml-4 space-y-0.5 border-l border-sidebar-border/30 pl-2">
                          {item.subItems.map((sub) => {
                            const subActive = pathname === sub.path;
                            return (
                              <Link
                                key={sub.key}
                                href={sub.path}
                                onClick={() => setMobileOpen(false)}
                                className={`block rounded-md px-2.5 py-1.5 text-xs transition-all ${
                                  subActive
                                    ? "font-medium text-sidebar-primary"
                                    : "text-sidebar-foreground opacity-60 hover:opacity-100"
                                }`}
                              >
                                {sub.label}
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>

      {!isCollapsed ? (
        <div className="flex w-full shrink-0 items-center gap-2 border-t border-sidebar-border px-3 py-2">
          <div className="brand-gradient grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-semibold text-primary-foreground shadow-elegant">
            NV
          </div>
          <div className="min-w-0 text-[11px] leading-tight">
            <div className="truncate font-medium text-sidebar-foreground">Công ty ABC</div>
            <div className="truncate text-sidebar-foreground opacity-60">nhân viên · kho HCM</div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {error || notice ? (
        <div className="fixed right-4 top-16 z-[80] flex w-[min(460px,calc(100vw-2rem))] flex-col gap-2">
          {error ? (
            <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-xl">
              <div className="min-w-0 flex-1">{error}</div>
              <button type="button" className="-mr-1 rounded p-1 hover:bg-red-100" onClick={() => setError("")} aria-label="Đóng thông báo lỗi">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          {notice ? (
            <div role="status" className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-xl">
              <div className="min-w-0 flex-1">{notice}</div>
              <button type="button" className="-mr-1 rounded p-1 hover:bg-emerald-100" onClick={() => setNotice("")} aria-label="Đóng thông báo">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <aside className={`fixed inset-y-0 left-0 z-40 hidden h-screen shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out lg:flex ${collapsed ? "w-[60px]" : "w-[216px]"}`}>
        {renderSidebar(collapsed)}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button className="absolute inset-0 bg-foreground/50 backdrop-blur-sm" aria-label="Đóng menu" onClick={() => setMobileOpen(false)} />
          <div className="relative flex w-72 max-w-[82vw] flex-col bg-sidebar shadow-elegant">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-sidebar-foreground opacity-70 hover:bg-sidebar-accent hover:opacity-100 hover:text-sidebar-foreground"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
            {renderSidebar(false)}
          </div>
        </div>
      ) : null}

      <div className={`flex min-h-screen min-w-0 flex-col transition-[margin-left] duration-200 ease-out ${collapsed ? "lg:ml-[60px]" : "lg:ml-[216px]"}`}>
        <header className={`fixed inset-x-0 top-0 z-30 border-b bg-card/95 backdrop-blur-xl transition-[left] duration-200 ease-out ${collapsed ? "lg:left-[60px]" : "lg:left-[216px]"}`}>
          <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              className="-ml-2 rounded-md p-2 hover:bg-muted lg:hidden"
              aria-label="Mở menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              onClick={() => setCollapsed((value) => !value)}
              className="-ml-1 hidden h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
              aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
              title={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold tracking-tight">{currentNav.label}</h1>
            </div>
            <button
              className="hidden h-9 w-72 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/70 md:flex"
              type="button"
            >
              <Search className="h-4 w-4" />
              <span>Tìm kiếm nhanh...</span>
              <kbd className="ml-auto rounded border bg-card px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
            </button>
            <button className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Thông báo" type="button">
              <Bell className="h-4 w-4" />
              {errorDocuments > 0 ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" /> : null}
            </button>
            <div className="brand-gradient grid h-9 w-9 place-items-center rounded-full text-xs font-semibold text-primary-foreground shadow-elegant">
              NV
            </div>
          </div>
        </header>

        <div className="subtle-gradient flex-1 space-y-4 px-4 pb-24 pt-[4.5rem] lg:px-6 lg:pb-7 lg:pt-20">
          {children}
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 shadow-elegant backdrop-blur lg:hidden">
          {[
            { path: "/", icon: LayoutDashboard, label: "Bảng" },
            { path: "/scan", icon: FileSpreadsheet, label: "Scan" },
            { path: "/summary", icon: Table2, label: "Tổng hợp" },
            { path: "/products", icon: Package, label: "Vận hành" },
            { path: "/settings", icon: Settings, label: "Cài đặt" }
          ].map((item) => {
            const Icon = item.icon;
            const active = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${active ? "font-medium text-primary" : "text-muted-foreground"}`}
              >
                <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
