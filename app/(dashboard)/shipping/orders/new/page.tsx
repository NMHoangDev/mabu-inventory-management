"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  User,
  Phone,
  MapPin,
  Truck,
  Package,
  DollarSign,
  Weight,
  StickyNote,
} from "lucide-react";

const PARTNERS = ["NINJA VAN", "JNT Express", "GHN", "GHTK", "Viettel Post", "Chành Lộc Hà"];

export default function NewShippingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    shipping_address: "",
    province: "",
    district: "",
    ward: "",
    partner: "NINJA VAN",
    partner_service: "",
    cod_amount: 0,
    shipping_fee: 0,
    weight: 0,
    note: "",
    branch: "Chi nhánh chính",
    staff: "Nguyễn Văn A",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.customer_name.trim()) {
      setError("Vui lòng nhập tên người nhận.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/shippings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Lưu thất bại");
      }
      const created = await res.json();
      router.push(`/shipping/orders/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/shipping/orders" className="p-2 hover:bg-slate-100 rounded">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </Link>
          <h1 className="text-lg font-semibold text-slate-800">Tạo vận đơn mới</h1>
        </div>
        <button
          onClick={submit}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#0088FF] text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {saving ? "Đang lưu..." : "Lưu vận đơn"}
        </button>
      </header>

      <div className="p-6 max-w-4xl space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>
        )}

        <section className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <User className="w-4 h-4" /> Thông tin người nhận
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Họ tên *" icon={<User className="w-4 h-4 text-slate-400" />}>
              <input
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
                placeholder="Nguyễn Văn A"
              />
            </Field>
            <Field label="Số điện thoại" icon={<Phone className="w-4 h-4 text-slate-400" />}>
              <input
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
                placeholder="0901234567"
              />
            </Field>
            <Field label="Tỉnh/Thành phố" icon={<MapPin className="w-4 h-4 text-slate-400" />}>
              <input
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
                placeholder="TP. Hồ Chí Minh"
              />
            </Field>
            <Field label="Quận/Huyện">
              <input
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
                placeholder="Quận 1"
              />
            </Field>
            <Field label="Phường/Xã">
              <input
                value={form.ward}
                onChange={(e) => setForm({ ...form, ward: e.target.value })}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
                placeholder="Phường Bến Nghé"
              />
            </Field>
            <Field label="Địa chỉ chi tiết" full>
              <input
                value={form.shipping_address}
                onChange={(e) => setForm({ ...form, shipping_address: e.target.value })}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
                placeholder="Số nhà, ngõ, đường..."
              />
            </Field>
          </div>
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Truck className="w-4 h-4" /> Đối tác vận chuyển
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Đối tác">
              <select
                value={form.partner}
                onChange={(e) => setForm({ ...form, partner: e.target.value })}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
              >
                {PARTNERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Dịch vụ">
              <input
                value={form.partner_service}
                onChange={(e) => setForm({ ...form, partner_service: e.target.value })}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
                placeholder="Giao tiêu chuẩn / Nhanh / Hỏa tốc"
              />
            </Field>
          </div>
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Package className="w-4 h-4" /> Thông tin kiện hàng
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Tiền thu hộ (COD)" icon={<DollarSign className="w-4 h-4 text-slate-400" />}>
              <input
                type="number"
                value={form.cod_amount}
                onChange={(e) => setForm({ ...form, cod_amount: Number(e.target.value) || 0 })}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
              />
            </Field>
            <Field label="Phí vận chuyển" icon={<DollarSign className="w-4 h-4 text-slate-400" />}>
              <input
                type="number"
                value={form.shipping_fee}
                onChange={(e) => setForm({ ...form, shipping_fee: Number(e.target.value) || 0 })}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
              />
            </Field>
            <Field label="Khối lượng (g)" icon={<Weight className="w-4 h-4 text-slate-400" />}>
              <input
                type="number"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: Number(e.target.value) || 0 })}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
              />
            </Field>
          </div>
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <StickyNote className="w-4 h-4" /> Ghi chú
          </h3>
          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Ghi chú nội bộ..."
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none h-24 resize-none"
          />
        </section>
      </div>
    </div>
  );
}

function Field({ label, icon, children, full = false }: { label: string; icon?: React.ReactNode; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
        {icon} {label}
      </label>
      {children}
    </div>
  );
}
