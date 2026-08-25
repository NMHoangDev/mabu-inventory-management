import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefrontProductBySlug, listStorefrontCategories } from "@/lib/storefront/catalog";
import { fmtMoney } from "@/lib/storefront/format";
import { ArrowLeft, ImageOff } from "@/components/shop/icons";
import Header from "@/components/shop/Header";
import Footer from "@/components/shop/Footer";
import AddToCartButton from "@/components/shop/AddToCartButton";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const product = await getStorefrontProductBySlug(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.short_description || product.description,
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const [product, categories] = await Promise.all([
    getStorefrontProductBySlug(slug),
    listStorefrontCategories(),
  ]);

  if (!product) notFound();

  const hasDiscount = !!product.compare_at_price && product.compare_at_price > product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.compare_at_price! - product.price) / product.compare_at_price!) * 100)
    : 0;
  const images = product.images.length > 0 ? product.images : product.image_url ? [{ url: product.image_url, alt: product.name }] : [];

  return (
    <div className="min-h-screen bg-shop-surface">
      <Header categories={categories} />

      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white lg:top-[6.5rem]">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/shop" className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 transition-colors hover:bg-gray-200">
            <ArrowLeft size={18} />
          </Link>
          <nav className="flex items-center gap-2 overflow-hidden text-sm text-shop-text-muted">
            <Link href="/shop" className="whitespace-nowrap transition-colors hover:text-shop-primary">
              Trang chủ
            </Link>
            {product.category_name && (
              <>
                <span>/</span>
                <span className="whitespace-nowrap">{product.category_name}</span>
              </>
            )}
            <span>/</span>
            <span className="line-clamp-1 truncate font-medium text-shop-text">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-6 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {images[0] ? (
              <img src={images[0].url} alt={images[0].alt || product.name} className="h-full w-full object-cover" />
            ) : (
              <ImageOff size={48} className="text-shop-text-muted opacity-40" />
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <div key={i} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-white">
                  <img src={img.url} alt={img.alt || product.name} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {hasDiscount && (
              <span className="rounded-lg bg-shop-primary px-2.5 py-1 text-xs font-bold text-white">-{discountPct}%</span>
            )}
            {product.stock <= 0 && (
              <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-white">Hết hàng</span>
            )}
          </div>

          <h1 className="text-2xl font-black leading-tight text-shop-text">{product.name}</h1>

          {product.short_description && <p className="text-sm text-shop-text-muted">{product.short_description}</p>}

          <div className="space-y-2 rounded-2xl border border-gray-100 bg-shop-surface p-4">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-black text-shop-primary">{fmtMoney(product.price)}</span>
              {hasDiscount && <span className="text-base text-shop-text-muted line-through">{fmtMoney(product.compare_at_price!)}</span>}
            </div>
            <p className="text-xs text-shop-text-muted">Đơn vị: {product.unit || "sản phẩm"}</p>
          </div>

          {product.description && (
            <div className="space-y-2">
              <h2 className="font-bold text-shop-text">Mô tả sản phẩm</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-shop-text-muted">{product.description}</p>
            </div>
          )}

          <AddToCartButton product={product} />

          <div className="grid grid-cols-2 gap-2 pt-2">
            {[
              { icon: "🚚", text: "Free ship từ 100k" },
              { icon: "💬", text: "Chốt đơn qua Zalo" },
              { icon: "✅", text: "Hàng chính hãng" },
              { icon: "🔄", text: "Đổi trả dễ dàng" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-shop-surface px-3 py-2 text-xs text-shop-text-muted">
                <span>{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
