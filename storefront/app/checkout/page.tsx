"use client";

// app/checkout/page.tsx
// Trang thanh toán: form giao hàng (có validate SĐT), phương thức thanh toán + QR chuyển khoản, tóm tắt đơn hàng

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Truck, CreditCard, Wallet, Banknote, ChevronLeft } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useOrder } from "@/context/OrderContext";
import { formatVND } from "@/data/mockData";
import { Order } from "@/types";

const SHIPPING_FEE = 50000;
const FREE_SHIPPING_THRESHOLD = 2000000;

// Thông tin nhận chuyển khoản MB Bank
const BANK_ID = "970422";
const ACCOUNT_NUMBER = "0337915530";
const ACCOUNT_NAME = "NGUYEN THI HONG VAN";

function buildVietQRUrl(amount: number, orderInfo: string) {
  const encodedInfo = encodeURIComponent(orderInfo);
  const encodedName = encodeURIComponent(ACCOUNT_NAME);
  return `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NUMBER}-compact2.png?amount=${amount}&addInfo=${encodedInfo}&accountName=${encodedName}`;
}

function generateOrderId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900 + 100);
  return `DH${y}${m}${d}${rand}`;
}

// Validate số điện thoại Việt Nam: bắt đầu bằng 03,05,07,08,09 + 8 số, tổng 10 số
function isValidVietnamesePhone(phone: string): boolean {
  const cleaned = phone.replace(/\s/g, "");
  return /^(0[35789])[0-9]{8}$/.test(cleaned);
}

type PaymentMethod = "cod" | "bank" | "card";

const paymentOptions: { id: PaymentMethod; label: string; desc: string; icon: React.ElementType }[] = [
  { id: "cod", label: "Thanh toán khi nhận hàng (COD)", desc: "Trả tiền mặt khi nhận sản phẩm", icon: Banknote },
  { id: "bank", label: "Chuyển khoản ngân hàng", desc: "Chuyển khoản trước, giao hàng sau khi xác nhận", icon: Wallet },
  { id: "card", label: "Thẻ tín dụng/ghi nợ", desc: "Thanh toán an toàn qua cổng thanh toán", icon: CreditCard },
];

const paymentLabelMap: Record<PaymentMethod, string> = {
  cod: "Thanh toán khi nhận hàng (COD)",
  bank: "Chuyển khoản ngân hàng",
  card: "Thẻ tín dụng/ghi nợ",
};

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart } = useCart();
  const { addOrder } = useOrder();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [submitting, setSubmitting] = useState(false);
  const [orderIdPreview] = useState(() => generateOrderId());
  const [phoneError, setPhoneError] = useState("");

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    note: "",
  });

  const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal + shippingFee;

  const handleChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (field === "phone") setPhoneError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    // Validate số điện thoại trước khi cho đặt hàng
    if (!isValidVietnamesePhone(form.phone)) {
      setPhoneError("Số điện thoại không hợp lệ. Vui lòng nhập đúng số điện thoại Việt Nam (VD: 0901234567).");
      return;
    }
    setPhoneError("");
    setSubmitting(true);

    const now = new Date();

    const order: Order = {
      id: orderIdPreview,
      date: now.toISOString().slice(0, 10),
      createdAt: now.toISOString(),
      status: paymentMethod === "cod" ? "Đang xử lý" : "Chờ thanh toán",
      items: items.map((item) => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        image: item.image,
        quantity: item.quantity,
      })),
      subtotal,
      shippingFee,
      total,
      shippingAddress: `${form.address}, ${form.city}`,
      paymentMethod: paymentLabelMap[paymentMethod],
    };

    // Lưu ngay lập tức vào danh sách đơn hàng trước khi chuyển trang
    addOrder(order);

    setTimeout(() => {
      clearCart();
      router.push("/checkout/success");
    }, 900);
  };

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[#1A365D]">Giỏ hàng đang trống</h1>
        <p className="text-gray-500 mt-2">Hãy thêm sản phẩm vào giỏ trước khi thanh toán.</p>
        <Link
          href="/products"
          className="inline-flex mt-6 px-6 py-3 rounded-xl bg-[#1A365D] text-white text-sm font-medium hover:bg-[#142c4a]"
        >
          Quay lại mua sắm
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
      <Link
        href="/cart"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1A365D] mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Quay lại giỏ hàng
      </Link>

      <h1 className="text-2xl md:text-3xl font-bold text-[#1A365D] mb-8">Thanh Toán</h1>

      <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-8">
        {/* Left column */}
        <div className="flex-1 space-y-6">
          {/* Shipping info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <Truck className="w-5 h-5 text-[#1A365D]" />
              <h2 className="text-lg font-bold text-[#1A365D]">Thông Tin Giao Hàng</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-1">
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Họ và tên</label>
                <input
                  required
                  value={form.fullName}
                  onChange={handleChange("fullName")}
                  type="text"
                  placeholder="Nguyễn Văn A"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D]"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Số điện thoại</label>
                <input
                  required
                  value={form.phone}
                  onChange={handleChange("phone")}
                  type="tel"
                  inputMode="numeric"
                  placeholder="0901234567"
                  className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 ${
                    phoneError
                      ? "border-red-400 focus:ring-red-100"
                      : "border-gray-200 focus:ring-[#1A365D]/20 focus:border-[#1A365D]"
                  }`}
                />
                {phoneError && <p className="text-xs text-red-500 mt-1.5">{phoneError}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Email</label>
                <input
                  required
                  value={form.email}
                  onChange={handleChange("email")}
                  type="email"
                  placeholder="ban@email.com"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Địa chỉ</label>
                <input
                  required
                  value={form.address}
                  onChange={handleChange("address")}
                  type="text"
                  placeholder="Số nhà, tên đường, phường/xã"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Tỉnh/Thành phố</label>
                <input
                  required
                  value={form.city}
                  onChange={handleChange("city")}
                  type="text"
                  placeholder="TP. Hồ Chí Minh"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Ghi chú (tùy chọn)</label>
                <textarea
                  value={form.note}
                  onChange={handleChange("note")}
                  rows={3}
                  placeholder="Ghi chú cho đơn hàng, ví dụ: giao giờ hành chính"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] resize-none"
                />
              </div>
            </div>
          </div>

          {/* Payment method */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <CreditCard className="w-5 h-5 text-[#1A365D]" />
              <h2 className="text-lg font-bold text-[#1A365D]">Phương Thức Thanh Toán</h2>
            </div>
            <div className="space-y-3">
              {paymentOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = paymentMethod === option.id;
                return (
                  <label
                    key={option.id}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                      isSelected ? "border-[#1A365D] bg-[#1A365D]/5" : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      checked={isSelected}
                      onChange={() => setPaymentMethod(option.id)}
                      className="w-4 h-4 text-[#1A365D] focus:ring-[#1A365D]/30"
                    />
                    <Icon className={`w-5 h-5 ${isSelected ? "text-[#1A365D]" : "text-gray-400"}`} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">{option.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{option.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            {paymentMethod === "bank" && (
              <div className="mt-4 p-5 rounded-xl bg-[#F7FAFC] border border-gray-100 flex flex-col sm:flex-row items-center gap-5">
                <div className="relative w-44 h-44 shrink-0 bg-white rounded-lg p-2 border border-gray-200">
                  <Image
                    src={buildVietQRUrl(total, orderIdPreview)}
                    alt="Mã QR chuyển khoản MB Bank"
                    fill
                    sizes="176px"
                    className="object-contain"
                    unoptimized
                  />
                </div>
                <div className="text-sm space-y-1.5">
                  <p className="font-semibold text-gray-800">Quét mã để chuyển khoản</p>
                  <p className="text-gray-600">Ngân hàng: <span className="font-medium">MB Bank</span></p>
                  <p className="text-gray-600">Số tài khoản: <span className="font-medium">{ACCOUNT_NUMBER}</span></p>
                  <p className="text-gray-600">Chủ tài khoản: <span className="font-medium">{ACCOUNT_NAME}</span></p>
                  <p className="text-gray-600">Số tiền: <span className="font-medium text-[#1A365D]">{formatVND(total)}</span></p>
                  <p className="text-xs text-gray-400 mt-2">Đơn hàng sẽ được xác nhận sau khi chúng tôi nhận được thanh toán.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column - order summary */}
        <aside className="w-full lg:w-96 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sticky top-24">
            <h2 className="text-lg font-bold text-[#1A365D] mb-5">Đơn Hàng Của Bạn</h2>

            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.productId} className="flex gap-3">
                  <div className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-[#F7FAFC]">
                    <Image src={item.image} alt={item.name} fill sizes="56px" className="object-cover" />
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-[#1A365D] text-white text-[10px] font-bold">
                      {item.quantity}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 line-clamp-1">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatVND(item.price)}</p>
                  </div>
                  <span className="text-sm font-semibold text-[#1A365D] shrink-0">
                    {formatVND(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 mt-4 pt-4 space-y-2.5 text-sm">
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
            </div>

            <div className="border-t border-gray-100 mt-4 pt-4 flex justify-between items-baseline">
              <span className="text-sm font-semibold text-gray-700">Tổng cộng</span>
              <span className="text-xl font-bold text-[#1A365D]">{formatVND(total)}</span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#1A365D] text-white font-semibold text-sm hover:bg-[#142c4a] active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {submitting ? "Đang xử lý..." : "Đặt Hàng"}
            </button>
            <p className="text-xs text-gray-400 text-center mt-3">
              Bằng việc đặt hàng, bạn đồng ý với điều khoản dịch vụ của TIME TECH.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}