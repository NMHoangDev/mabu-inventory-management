"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, ImageOff, Minus, Plus, ShoppingCart } from "lucide-react";
import { useCart } from "@/components/storefront/CartContext";
import { fmtMoney } from "@/lib/storefront/format";
import type { StorefrontProductDetail } from "@/lib/storefront/catalog";

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const { addItem } = useCart();
  const [product, setProduct] = useState<StorefrontProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/storefront/products/${params.slug}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Không tìm thấy sản phẩm.");
        setProduct(data.product);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Đã xảy ra lỗi."))
      .finally(() => setLoading(false));
  }, [params.slug]);

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-[var(--muted-foreground)]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (error || !product) {
    return <p className="py-20 text-center text-[var(--muted-foreground)]">{error || "Không tìm thấy sản phẩm."}</p>;
  }

  const outOfStock = product.stock <= 0;
  const images = product.images.length > 0 ? product.images : [{ url: product.image_url, alt: product.name }];

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-3">
        <div className="panel aspect-square overflow-hidden bg-[var(--secondary)]">
          {images[activeImage]?.url ? (
            <img src={images[activeImage].url} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--muted-foreground)]">
              <ImageOff className="h-10 w-10" />
            </div>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-2">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setActiveImage(i)}
                className={`h-16 w-16 overflow-hidden rounded border-2 ${i === activeImage ? "border-[var(--primary)]" : "border-transparent"}`}
              >
                {img.url ? <img src={img.url} alt={img.alt} className="h-full w-full object-cover" /> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {product.category_name && <span className="section-caption">{product.category_name}</span>}
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        <div className="text-3xl font-bold text-[var(--primary)]">{fmtMoney(product.price)}</div>
        {product.unit && <div className="section-caption">Đơn vị: {product.unit}</div>}

        {product.short_description && <p className="text-sm text-[var(--muted-foreground)]">{product.short_description}</p>}

        {outOfStock ? (
          <div className="rounded-md bg-[var(--destructive)] px-4 py-2 text-sm font-medium text-white">Sản phẩm tạm hết hàng</div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-md border">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-10 w-10 items-center justify-center hover:bg-[var(--accent)]"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-sm font-medium">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                className="flex h-10 w-10 items-center justify-center hover:bg-[var(--accent)]"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => {
                addItem(
                  {
                    product_id: product.id,
                    name: product.name,
                    slug: product.slug,
                    unit: product.unit,
                    price: product.price,
                    image_url: product.image_url,
                  },
                  quantity
                );
                setAdded(true);
                setTimeout(() => setAdded(false), 2000);
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90"
            >
              <ShoppingCart className="h-4 w-4" />
              {added ? "Đã thêm vào giỏ!" : "Thêm vào giỏ hàng"}
            </button>
          </div>
        )}

        {product.description && (
          <div className="panel p-4">
            <h2 className="section-title mb-2">Mô tả sản phẩm</h2>
            <p className="whitespace-pre-line text-sm text-[var(--muted-foreground)]">{product.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
