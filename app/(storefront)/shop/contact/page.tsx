"use client";

import { Mail, MapPin, Phone } from "lucide-react";

export default function ContactPage() {
  return (
    <div className="space-y-12 pb-16 pt-4 max-w-5xl mx-auto">
      {/* Hero */}
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">Liên Hệ Với Chúng Tôi</h1>
        <p className="text-lg text-slate-500 max-w-2xl mx-auto">
          Chúng tôi luôn lắng nghe và sẵn sàng hỗ trợ bạn. Đừng ngần ngại liên hệ qua các kênh dưới đây hoặc để lại tin nhắn.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-12">
        {/* Contact Info */}
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Thông tin liên lạc</h3>
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-800">Trụ sở chính</h4>
                <p className="text-sm text-slate-500 mt-1">123 Đường Nguyễn Văn Linh, Quận 7<br/>Thành phố Hồ Chí Minh, Việt Nam</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-800">Điện thoại</h4>
                <p className="text-sm text-slate-500 mt-1">1900 1234 5678 (Giờ hành chính)<br/>0909 123 456 (Hotline 24/7)</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-800">Email</h4>
                <p className="text-sm text-slate-500 mt-1">hotro@cuahangcuaban.com<br/>kinhdoanh@cuahangcuaban.com</p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="bg-white p-8 rounded-3xl shadow-elegant border border-slate-100">
          <h3 className="text-2xl font-bold text-slate-800 tracking-tight mb-6">Gửi tin nhắn</h3>
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); alert("Tin nhắn đã được gửi thành công!"); }}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Họ và tên</label>
                <input type="text" className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] outline-none transition-all" placeholder="Nguyễn Văn A" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Số điện thoại</label>
                <input type="text" className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] outline-none transition-all" placeholder="0909..." required />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Email</label>
              <input type="email" className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] outline-none transition-all" placeholder="email@domain.com" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Nội dung tin nhắn</label>
              <textarea rows={4} className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] outline-none transition-all" placeholder="Nhập nội dung bạn cần hỗ trợ..." required></textarea>
            </div>
            <button type="submit" className="w-full bg-[var(--primary)] text-white font-bold py-3 rounded-xl hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-md">
              Gửi Liên Hệ
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
