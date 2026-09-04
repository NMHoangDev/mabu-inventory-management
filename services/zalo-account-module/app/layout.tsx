import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quản lý Zalo tập trung",
  description: "Quản lý tài khoản Zalo và phân quyền nhân viên — InvoiceFlow Manager"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <h1 className="text-base font-semibold text-slate-900">Quản lý Zalo tập trung</h1>
            <span className="text-xs text-slate-400">InvoiceFlow Manager</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
