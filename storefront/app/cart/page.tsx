"use client";

// app/cart/page.tsx
// Trang giỏ hàng: danh sách item, tăng/giảm số lượng, xóa, và sidebar "Tóm tắt đơn hàng"

import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { formatVND } from "@/data/mockData";

const SHIPPING_FEE = 50000;
const FREE_SHIPPING_THRESHOLD = 2000000;

export default function CartPage() {
  const { items, updateQuantity, removeFromCart, subtotal } = useCart();

  const shippingFee = items.length === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal + shippingFee;

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <div className="w-20 h-20 rounded-full bg-[#F7FAFC] flex items-center justify-center mx-auto">
          <ShoppingBag className="w-9 h-9 text-gray-300" />
        </div>
        <h1 className="text-2xl font-bold text-[#1A365D] mt-6">Giỏ hàng của bạn đang trống</h1>
        <p className="text-gray-500 mt-2">Hãy khám phá bộ sưu tập của chúng tôi và thêm sản phẩm yêu thích.</p>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 mt-7 px-6 py-3.5 rounded-xl bg-[#1A365D] text-white text-sm font-semibold hover:bg-[#142c4a] transition-colors"
        >
          Bắt đầu mua sắm <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
      <h1 className="text-2xl md:text-3xl font-bold text-[#1A365D] mb-8">Giỏ Hàng</h1>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Cart items */}
        <div className="flex-1 space-y-4">
          {items.map((item) => (
            <div
              key={item.productId}
              className="flex gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
            >
              <Link href={`/products/${item.productId}`} className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-[#F7FAFC]">
                <Image src={item.image} alt={item.name} fill sizes="112px" className="object-cover" />
              </Link>

              <div className="flex-1 flex flex-col justify-between min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/products/${item.productId}`} className="min-w-0">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-800 hover:text-[#1A365D] transition-colors line-clamp-2">
                      {item.name}
                    </h3>
                  </Link>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                    aria-label="Xóa sản phẩm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      className="p-2 hover:bg-[#F7FAFC] transition-colors"
                      aria-label="Giảm số lượng"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-9 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      className="p-2 hover:bg-[#F7FAFC] transition-colors"
                      aria-label="Tăng số lượng"
                      disabled={item.quantity >= item.stock}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-base font-bold text-[#1A365D]">
                    {formatVND(item.price * item.quantity)}
                  </span>
                </div>
              </div>
            </div>
          ))}

          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1A365D] hover:text-[#C9A24B] transition-colors mt-2"
          >
            ← Tiếp tục mua sắm
          </Link>
        </div>

        {/* Order summary */}
        <aside className="w-full lg:w-96 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sticky top-24">
            <h2 className="text-lg font-bold text-[#1A365D] mb-5">Tóm Tắt Đơn Hàng</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Tạm tính</span>
                <span className="font-medium text-gray-800">{formatVND(subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Phí vận chuyển</span>
                <span className="font-medium text-gray-800">
                  {shippingFee === 0 ? "Miễn phí" : formatVND(shippingFee)}
                </span>
              </div>
              {shippingFee > 0 && (
                <p className="text-xs text-[#C9A24B] bg-[#C9A24B]/10 rounded-lg px-3 py-2">
                  Mua thêm {formatVND(FREE_SHIPPING_THRESHOLD - subtotal)} để được miễn phí vận chuyển
                </p>
              )}
            </div>

            <div className="border-t border-gray-100 mt-4 pt-4 flex justify-between items-baseline">
              <span className="text-sm font-semibold text-gray-700">Tổng cộng</span>
              <span className="text-xl font-bold text-[#1A365D]">{formatVND(total)}</span>
            </div>

            <Link
              href="/checkout"
              className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#1A365D] text-white font-semibold text-sm hover:bg-[#142c4a] active:scale-[0.98] transition-all"
            >
              Tiến Hành Thanh Toán <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
