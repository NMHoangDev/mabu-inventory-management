// app/layout.tsx
// Layout gốc: bọc toàn bộ app với font, CartProvider, WishlistProvider, OrderProvider, marquee, Navbar và Footer

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MarqueeBar from "@/components/MarqueeBar";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { OrderProvider } from "@/context/OrderContext";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "TIME TECH | Gọn Gàng Mỗi Ngày, Tinh Tế Mọi Khoảnh Khắc",
  description:
    "TIME TECH - Đồ dùng văn phòng và phụ kiện tóc chọn lọc, chất lượng cao cấp.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className={`${inter.variable} font-sans bg-[#F7FAFC] antialiased`}>
        <CartProvider>
          <WishlistProvider>
            <OrderProvider>
              <div className="flex flex-col min-h-screen">
                <MarqueeBar />
                <Navbar />
                <main className="flex-1">{children}</main>
                <Footer />
              </div>
            </OrderProvider>
          </WishlistProvider>
        </CartProvider>
      </body>
    </html>
  );
}