"use client";

/**
 * Sidebar trái — thay cho header ngang cũ (NavTabs). Mỗi mục = 1 route riêng
 * (không phải tab client-side) để URL rõ ràng, back/forward hoạt động đúng.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Smartphone, Users } from "lucide-react";
import StaffBadge from "@/components/StaffBadge";

const NAV_ITEMS = [
  { href: "/", label: "Tài khoản Zalo", icon: Smartphone },
  { href: "/staff", label: "Nhân viên & Phân quyền", icon: Users },
  { href: "/chat", label: "Nhắn tin", icon: MessageCircle },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-900">Quản lý Zalo</div>
          <div className="truncate text-[11px] text-slate-400">InvoiceFlow Manager</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon className={`h-4.5 w-4.5 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <StaffBadge />
      </div>
    </aside>
  );
}
