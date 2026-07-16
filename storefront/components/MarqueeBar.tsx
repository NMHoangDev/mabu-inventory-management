"use client";

// components/MarqueeBar.tsx
// Thanh chữ chạy quảng cáo ở đầu trang, thay cho 3 dòng trust-badge tĩnh cũ

const messages = [
  "🚚 Miễn phí vận chuyển cho đơn hàng từ 300.000đ",
  "↩️ Đổi trả dễ dàng trong vòng 7 ngày",
  "✨ Sản phẩm chọn lọc, chất lượng cao cấp",
  "🎁 Ưu đãi đặc biệt cho khách hàng mới tại TIME TECH",
];

export default function MarqueeBar() {
  const content = messages.join("    •    ");

  return (
    <div className="bg-[#1A365D] text-white overflow-hidden py-2 text-xs sm:text-sm font-medium">
      <div className="flex whitespace-nowrap animate-marquee">
        <span className="px-4">{content}</span>
        <span className="px-4">{content}</span>
      </div>
    </div>
  );
}