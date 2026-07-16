"use client";

// app/history/page.tsx
// Trang lịch sử đơn hàng: đọc đơn hàng thật đã lưu qua OrderContext

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package, ChevronDown, MapPin, Wallet } from "lucide-react";
import { formatVND } from "@/data/mockData";
import { useOrder } from "@/context/OrderContext";

const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
  "Đang xử lý": { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-400" },
  "Chờ thanh toán": { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-400" },
  "Đang giao": { bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-400" },
  "Hoàn thành": { bg: "bg-green-50", text: "text-green-600", dot: "bg-green-500" },
  "Đã hủy": { bg: "bg-red-50", text: "text-red-500", dot: "bg-red-400" },
};

const statusFilters = ["Tất cả", "Đang xử lý", "Chờ thanh toán", "Đang giao", "Hoàn thành", "Đã hủy"];

export default function OrderHistoryPage() {
  const { orders } = useOrder();
  const [activeFilter, setActiveFilter] = useState("Tất cả");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredOrders =
    activeFilter === "Tất cả" ? orders : orders.filter((o) => o.status === activeFilter);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
      <h1 className="text-2xl md:text-3xl font-bold text-[#1A365D] mb-2">Đơn Hàng Của Tôi</h1>
      <p className="text-gray-500 text-sm mb-7">Theo dõi trạng thái các đơn hàng bạn đã đặt</p>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-1 px-1">
        {statusFilters.map((status) => (
          <button
            key={status}
            onClick={() => setActiveFilter(status)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeFilter === status
                ? "bg-[#1A365D] text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-[#1A365D]/30"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Bạn chưa có đơn hàng nào.</p>
          <Link
            href="/products"
            className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-[#1A365D] text-white text-sm font-medium hover:bg-[#142c4a]"
          >
            Khám phá sản phẩm
          </Link>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Không có đơn hàng nào ở trạng thái này.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredOrders.map((order) => {
            const isExpanded = expandedId === order.id;
            const style = statusStyles[order.status] || {
              bg: "bg-gray-100",
              text: "text-gray-600",
              dot: "bg-gray-400",
            };
            const totalItemsQty = order.items.reduce((sum, i) => sum + i.quantity, 0);

            return (
              <div
                key={order.id}
                className="relative bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden pl-1"
              >
                {/* dải màu trạng thái bên trái */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.dot}`} />

                {/* header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-left border-b border-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F7FAFC] flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5 text-[#1A365D]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">#{order.id}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Đặt ngày {new Date(order.date).toLocaleDateString("vi-VN")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {order.status}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>

                {/* danh sách sản phẩm - luôn hiện preview món đầu tiên */}
                <div className="px-5 py-4 space-y-4">
                  {(isExpanded ? order.items : order.items.slice(0, 1)).map((item) => (
                    <div key={item.productId} className="flex items-center gap-3.5">
                      <div className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-[#F7FAFC] border border-gray-100">
                        <Image src={item.image} alt={item.name} fill sizes="64px" className="object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 line-clamp-2">{item.name}</p>
                        <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md bg-gray-50 text-gray-500 text-xs">
                          x{item.quantity}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-[#1A365D] shrink-0">
                        {formatVND(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}

                  {!isExpanded && order.items.length > 1 && (
                    <button
                      onClick={() => setExpandedId(order.id)}
                      className="text-xs font-medium text-[#1A365D]/70 hover:text-[#1A365D]"
                    >
                      + {order.items.length - 1} sản phẩm khác
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-gray-100 text-sm">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-gray-400 text-xs uppercase tracking-wide">Địa chỉ giao hàng</p>
                          <p className="text-gray-700 mt-0.5">{order.shippingAddress}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Wallet className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-gray-400 text-xs uppercase tracking-wide">Thanh toán</p>
                          <p className="text-gray-700 mt-0.5">{order.paymentMethod}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* footer tổng tiền - kiểu Shopee */}
                <div className="flex items-center justify-between px-5 py-3.5 bg-[#F7FAFC] border-t border-gray-100">
                  <span className="text-xs text-gray-500">{totalItemsQty} sản phẩm</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-gray-500">Thành tiền</span>
                    <span className="text-lg font-bold text-[#C9A24B]">{formatVND(order.total)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-center mt-10">
        <Link
          href="/products"
          className="text-sm font-medium text-[#1A365D] hover:text-[#C9A24B] transition-colors"
        >
          ← Tiếp tục mua sắm
        </Link>
      </div>
    </div>
  );
}