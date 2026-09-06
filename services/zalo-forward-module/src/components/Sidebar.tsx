"use client";

/**
 * Sidebar trái — mỗi tính năng 1 tab. Kiểu dáng port từ app shell của webapp
 * merkeeai (qua zalo-account-module): rộng 280px, tab đang mở TÔ ĐẶC màu
 * thương hiệu (không phải nền nhạt + chữ màu), icon phóng nhẹ khi hover, phân
 * định bằng viền. Module này chỉ có 2 tính năng chính: luật chuyển tiếp +
 * nhắn tin (chat tổng, không gắn theo 1 rule cụ thể — vào từ nút "Chat" trên
 * từng rule thì có kèm ?threadId để mở đúng nhóm đó luôn).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Send } from "lucide-react";
import StaffBadge from "@/components/StaffBadge";

const NAV_ITEMS = [
  { href: "/", label: "Luật chuyển tiếp", icon: Send, desc: "Nhóm chính → nhóm đích" },
  { href: "/chat", label: "Nhắn tin", icon: MessageCircle, desc: "Gửi & nhận tin" }
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[280px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
          <Send className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold tracking-tight text-slate-900">Chuyển tiếp Zalo</div>
          <div className="truncate text-xs text-slate-500">InvoiceFlow Manager</div>
        </div>
      </div>

      <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                active
                  ? "bg-brand font-semibold text-white shadow-sm"
                  : "font-medium text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Icon
                className={`mt-0.5 h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-105 ${
                  active ? "text-white" : "text-slate-400 group-hover:text-slate-600"
                }`}
              />
              <span className="min-w-0">
                <span className="block truncate leading-tight">{item.label}</span>
                <span className={`block truncate text-xs ${active ? "text-white/70" : "text-slate-400"}`}>
                  {item.desc}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <StaffBadge />
      </div>
    </aside>
  );
}
