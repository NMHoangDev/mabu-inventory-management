"use client";

// app/checkout/success/page.tsx
// Trang xác nhận đặt hàng thành công: hiển thị đúng đơn hàng khách vừa đặt, giờ VN, nút hủy đơn

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Package, Home, XCircle } from "lucide-react";
import { formatVND } from "@/data/mockData";
import { Order } from "@/types";
import { useOrder, getStoredLastOrder } from "@/context/OrderContext";

function formatVietnamDateTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const { lastOrder, updateOrderStatus } = useOrder();
  const [order, setOrder] = useState<Order | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    setOrder(lastOrder ?? getStoredLastOrder());
  }, [lastOrder]);

  const handleCancelOrder = () => {
    if (!order) return;
    updateOrderStatus(order.id, "Đã hủy");
    setShowCancelConfirm(false);
    setTimeout(() => {
      router.push("/");
    }, 1200);
  };

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <p className="text-gray-500">Không tìm thấy thông tin đơn hàng.</p>
        <Link href="/" className="text-[#1A365D] font-semibold underline mt-3 inline-block">
          Quay về trang chủ
        </Link>
      </div>
    );
  }

  const isCancelled = order.status === "Đã hủy";

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 md:py-24">
      <div className="text-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${isCancelled ? "bg-red-50" : "bg-green-50"}`}>
          {isCancelled ? (
            <XCircle className="w-11 h-11 text-red-500" />
          ) : (
            <CheckCircle2 className="w-11 h-11 text-green-600" />
          )}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-[#1A365D] mt-6">
          {isCancelled ? "Đơn hàng đã hủy" : "Đặt hàng thành công!"}
        </h1>
        <p className="text-gray-500 mt-2 max-w-md mx-auto">
          {isCancelled
            ? "Đơn hàng của bạn đã được hủy thành công. Đang chuyển về trang chủ..."
            : "Cảm ơn bạn đã mua sắm tại TIME TECH. Chúng tôi đã gửi email xác nhận đơn hàng và sẽ sớm liên hệ để giao hàng."}
        </p>
        <p className="text-sm text-gray-400 mt-2">
          Đặt lúc: {formatVietnamDateTime(order.createdAt)} (giờ Việt Nam)
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mt-10">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Package className="w-5 h-5 text-[#1A365D]" />
            <span className="text-sm font-semibold text-gray-800">
              Mã đơn hàng: <span className="text-[#1A365D]">#{order.id}</span>
            </span>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              isCancelled ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-600"
            }`}
          >
            {order.status}
          </span>
        </div>

        <div className="space-y-3 py-4">
          {order.items.map((item) => (
            <div key={item.productId} className="flex items-center gap-3 text-sm">
              <div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-[#F7FAFC]">
                <Image src={item.image} alt={item.name} fill sizes="40px" className="object-cover" />
              </div>
              <span className="flex-1 text-gray-600">
                {item.name} <span className="text-gray-400">x{item.quantity}</span>
              </span>
              <span className="font-medium text-gray-800">{formatVND(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Tạm tính</span>
            <span>{formatVND(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Phí vận chuyển</span>
            <span>{order.shippingFee === 0 ? "Miễn phí" : formatVND(order.shippingFee)}</span>
          </div>
          <div className="flex justify-between items-baseline pt-2 border-t border-gray-100">
            <span className="font-semibold text-gray-700">Tổng cộng</span>
            <span className="text-lg font-bold text-[#1A365D]">{formatVND(order.total)}</span>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide">Địa chỉ giao hàng</p>
            <p className="text-gray-700 mt-1">{order.shippingAddress}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide">Phương thức thanh toán</p>
            <p className="text-gray-700 mt-1">{order.paymentMethod}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-8 justify-center">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#1A365D] text-white font-semibold text-sm hover:bg-[#142c4a] transition-colors"
        >
          <Home className="w-4 h-4" /> Quay Về Trang Chủ
        </Link>
        <Link
          href="/products"
          className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-gray-200 bg-white text-[#1A365D] font-semibold text-sm hover:bg-[#F7FAFC] transition-colors"
        >
          Tiếp Tục Mua Hàng
        </Link>
        <Link
          href="/history"
          className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-gray-200 bg-white text-[#1A365D] font-semibold text-sm hover:bg-[#F7FAFC] transition-colors"
        >
          Xem Đơn Hàng Của Tôi
        </Link>
        {!isCancelled && (
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-red-200 bg-white text-red-500 font-semibold text-sm hover:bg-red-50 transition-colors"
          >
            <XCircle className="w-4 h-4" /> Hủy Đơn Hàng
          </button>
        )}
      </div>

      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-[#1A365D]">Xác nhận hủy đơn</h3>
            <p className="text-sm text-gray-500 mt-2">
              Bạn có chắc chắn muốn hủy đơn hàng #{order.id}? Hành động này không thể hoàn tác.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Không, giữ đơn
              </button>
              <button
                onClick={handleCancelOrder}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600"
              >
                Xác nhận hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}