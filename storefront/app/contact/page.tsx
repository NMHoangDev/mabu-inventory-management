"use client";

// app/contact/page.tsx
// Trang liên hệ: 2 cột - trái thông tin liên hệ + bản đồ placeholder, phải form gửi tin nhắn

import { useState } from "react";
import { MapPin, Phone, Mail, Clock, Send, CheckCircle2 } from "lucide-react";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);

  const handleChange =
    (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    setForm({ name: "", email: "", subject: "", message: "" });
    setTimeout(() => setSent(false), 4000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-2xl md:text-3xl font-bold text-[#1A365D]">Liên Hệ Với Chúng Tôi</h1>
        <p className="text-gray-500 mt-2 text-sm md:text-base">
          Có câu hỏi về sản phẩm hoặc đơn hàng? Đội ngũ TIME TECH luôn sẵn sàng hỗ trợ bạn.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Left: contact info + map */}
        <div>
          <div className="space-y-5">
            <div className="flex items-start gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="w-11 h-11 rounded-xl bg-[#1A365D]/10 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-[#1A365D]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Địa chỉ cửa hàng</h3>
                <p className="text-sm text-gray-500 mt-1">
                  12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="w-11 h-11 rounded-xl bg-[#1A365D]/10 flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5 text-[#1A365D]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Hotline</h3>
                <p className="text-sm text-gray-500 mt-1">1900 6868 (8:00 - 21:00, tất cả các ngày)</p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="w-11 h-11 rounded-xl bg-[#1A365D]/10 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-[#1A365D]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Email</h3>
                <p className="text-sm text-gray-500 mt-1">hotro@timetech.vn</p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="w-11 h-11 rounded-xl bg-[#1A365D]/10 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-[#1A365D]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Giờ làm việc</h3>
                <p className="text-sm text-gray-500 mt-1">Thứ 2 - Chủ nhật: 8:00 - 21:00</p>
              </div>
            </div>
          </div>

          {/* Map placeholder */}
          <div className="mt-5 relative aspect-[4/3] sm:aspect-video rounded-2xl overflow-hidden border border-gray-100 bg-[#F7FAFC] flex items-center justify-center">
            <div className="text-center px-6">
              <MapPin className="w-8 h-8 text-[#1A365D]/30 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Bản đồ cửa hàng TIME TECH</p>
              <p className="text-xs text-gray-300 mt-1">(Vị trí bản đồ sẽ hiển thị ở đây)</p>
            </div>
          </div>
        </div>

        {/* Right: contact form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
          <h2 className="text-lg font-bold text-[#1A365D] mb-5">Gửi Tin Nhắn Cho Chúng Tôi</h2>

          {sent && (
            <div className="flex items-center gap-2.5 bg-green-50 text-green-700 rounded-xl px-4 py-3 mb-5 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Cảm ơn bạn! Tin nhắn đã được gửi, chúng tôi sẽ phản hồi sớm nhất.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Họ và tên</label>
                <input
                  required
                  value={form.name}
                  onChange={handleChange("name")}
                  type="text"
                  placeholder="Tên của bạn"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D]"
                />
              </div>
              <div>
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
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Tiêu đề</label>
              <input
                required
                value={form.subject}
                onChange={handleChange("subject")}
                type="text"
                placeholder="Chủ đề tin nhắn"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D]"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Nội dung</label>
              <textarea
                required
                value={form.message}
                onChange={handleChange("message")}
                rows={5}
                placeholder="Nội dung tin nhắn của bạn..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20 focus:border-[#1A365D] resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#1A365D] text-white font-semibold text-sm hover:bg-[#142c4a] active:scale-[0.98] transition-all"
            >
              <Send className="w-4 h-4" /> Gửi Tin Nhắn
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
