import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chuyển tiếp Zalo",
  description: "Tự động chuyển tiếp tin nhắn Zalo giữa các nhóm — InvoiceFlow Manager"
};

/**
 * Layout gốc — chỉ còn html/body thuần. Sidebar + StaffBadge giờ nằm ở
 * app/(dashboard)/layout.tsx (chỉ áp dụng cho các trang cần đăng nhập); trang
 * /login (ngoài route group (dashboard)) hiển thị full-screen không sidebar.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
