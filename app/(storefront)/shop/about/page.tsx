"use client";

import Link from "next/link";
import { Store, ShieldCheck, Truck, Clock } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="space-y-12 pb-16 pt-4 max-w-4xl mx-auto">
      {/* Hero */}
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">Về Chúng Tôi</h1>
        <p className="text-lg text-slate-500 max-w-2xl mx-auto">
          Cửa hàng của chúng tôi được sinh ra với sứ mệnh mang đến những sản phẩm chất lượng nhất, phong cách hiện đại nhất và dịch vụ chăm sóc khách hàng tận tâm nhất.
        </p>
      </section>

      {/* Image Banner */}
      <div className="aspect-[21/9] rounded-3xl overflow-hidden shadow-elegant bg-slate-100">
        <img 
          src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=2070&auto=format&fit=crop" 
          alt="Cửa hàng của chúng tôi" 
          className="w-full h-full object-cover"
        />
      </div>

      {/* Core Values */}
      <section className="grid sm:grid-cols-3 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center space-y-3">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Chất lượng đảm bảo</h3>
          <p className="text-sm text-slate-500">Mọi sản phẩm đều được kiểm định kỹ càng trước khi đến tay khách hàng.</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Giao hàng siêu tốc</h3>
          <p className="text-sm text-slate-500">Hợp tác với các đơn vị vận chuyển hàng đầu để đảm bảo thời gian giao hàng.</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center space-y-3">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Hỗ trợ 24/7</h3>
          <p className="text-sm text-slate-500">Đội ngũ chăm sóc khách hàng luôn sẵn sàng giải đáp mọi thắc mắc của bạn.</p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-slate-900 rounded-3xl p-10 text-center text-white space-y-6">
        <Store className="w-10 h-10 mx-auto text-slate-300" />
        <h2 className="text-2xl font-bold">Bạn đã sẵn sàng trải nghiệm?</h2>
        <p className="text-slate-400">Hàng ngàn sản phẩm đang chờ đón bạn.</p>
        <Link href="/shop/products" className="inline-block bg-white text-slate-900 px-8 py-3 rounded-full font-bold shadow-md hover:bg-slate-50 transition-colors">
          Mua sắm ngay
        </Link>
      </section>
    </div>
  );
}
