import { CartProvider } from "@/components/storefront/CartContext";
import { CustomerProvider } from "@/components/storefront/CustomerContext";
import { Header } from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/Footer";

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <CustomerProvider>
      <CartProvider>
        <div className="flex min-h-screen flex-col bg-[var(--background)]">
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
          <Footer />
        </div>
      </CartProvider>
    </CustomerProvider>
  );
}
