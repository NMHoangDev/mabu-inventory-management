import type { Metadata } from "next";
import "./globals.css";

import { AppProvider } from "@/invoice-flow-manager-fe/components/providers/AppProvider";

export const metadata: Metadata = {
  title: "InvoiceFlow Manager",
  description: "Quản lý scan và tổng hợp hóa đơn"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
