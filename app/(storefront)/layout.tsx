import { Toaster } from "react-hot-toast";
import CartOverlay from "@/components/shop/CartOverlay";
import CheckoutModal from "@/components/shop/CheckoutModal";
import StickyContactWidget from "@/components/shop/StickyContactWidget";
import MobileBottomBar from "@/components/shop/MobileBottomBar";

export const metadata = {
  title: {
    default: "Denfood – Đồ ăn vặt & Gia vị | Giá rẻ hơn sàn TMDT",
    template: "%s | Denfood",
  },
  description:
    "Mua đồ ăn vặt, kẹo bánh, gia vị, đồ uống tại Denfood. Đặt nhanh qua Zalo, giao tận nơi.",
};

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shop-scope min-h-screen bg-shop-surface text-shop-text">
      <StickyContactWidget />
      {children}
      <MobileBottomBar />
      <CartOverlay />
      <CheckoutModal />
      <Toaster position="bottom-center" />
    </div>
  );
}
