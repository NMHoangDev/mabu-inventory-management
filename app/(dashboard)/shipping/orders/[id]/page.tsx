"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  Edit3,
  XCircle,
  Truck,
  CheckCircle2,
  Clock,
  Package,
  Phone,
  MapPin,
  User as UserIcon,
  Building2,
  Info,
  Save,
} from "lucide-react";

type ShippingStatus =
  | "pending"
  | "packing"
  | "awaiting_pickup"
  | "shipping"
  | "delivered"
  | "returning"
  | "cancelled"
  | "returned"
  | "failed";

interface ShippingEvent {
  id: string;
  shipping_id: string;
  status: string;
  description: string;
  location: string;
  occurred_at: string;
  created_at: string;
}

interface Shipping {
  id: string;
  tracking_code: string;
  order_id: string | null;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  province: string;
  district: string;
  ward: string;
  partner: string;
  partner_service: string;
  status: ShippingStatus;
  cod_amount: number;
  shipping_fee: number;
  weight: number;
  note: string;
  branch: string;
  staff: string;
  packed_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  events: ShippingEvent[];
}

const STATUS_LABEL: Record<ShippingStatus, string> = {
  pending: "Chờ xử lý",
  packing: "Chờ đóng gói",
  awaiting_pickup: "Chờ lấy hàng",
  shipping: "Đang giao hàng",
  delivered: "Đã giao hàng",
  returning: "Chờ giao lại",
  cancelled: "Hủy giao",
  returned: "Đã hoàn",
  failed: "Giao thất bại",
};

const STATUS_BADGE: Record<ShippingStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  packing: "bg-blue-100 text-blue-700",
  awaiting_pickup: "bg-blue-100 text-blue-700",
  shipping: "bg-orange-100 text-orange-700",
  delivered: "bg-green-100 text-green-700",
  returning: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-700",
  returned: "bg-slate-200 text-slate-600",
  failed: "bg-red-100 text-red-700",
};

const NEXT_ACTIONS: { v: ShippingStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { v: "packing", label: "Đóng gói", icon: <Package className="w-4 h-4" />, color: "bg-blue-500 hover:bg-blue-600" },
  { v: "awaiting_pickup", label: "Chờ lấy hàng", icon: <Clock className="w-4 h-4" />, color: "bg-blue-500 hover:bg-blue-600" },
  { v: "shipping", label: "Đang giao", icon: <Truck className="w-4 h-4" />, color: "bg-orange-500 hover:bg-orange-600" },
  { v: "delivered", label: "Đã giao", icon: <CheckCircle2 className="w-4 h-4" />, color: "bg-green-500 hover:bg-green-600" },
  { v: "cancelled", label: "Hủy giao", icon: <XCircle className="w-4 h-4" />, color: "bg-red-500 hover:bg-red-600" },
  { v: "returning", label: "Giao lại", icon: <Truck className="w-4 h-4" />, color: "bg-yellow-500 hover:bg-yellow-600" },
];

const fmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${min} ${dd}/${mm}/${yyyy}`;
}

export default function ShippingDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [shipping, setShipping] = useState<Shipping | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Shipping>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/shippings/${id}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setShipping(data);
      setEditForm({
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        shipping_address: data.shipping_address,
        province: data.province,
        district: data.district,
        ward: data.ward,
        partner: data.partner,
        cod_amount: data.cod_amount,
        shipping_fee: data.shipping_fee,
        weight: data.weight,
        note: data.note,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (status: ShippingStatus) => {
    if (!id) return;
    const labels: Record<ShippingStatus, string> = {
      pending: "Chuyển về chờ xử lý",
      packing: "Đã đóng gói",
      awaiting_pickup: "Đã chuyển cho shipper",
      shipping: "Đã xuất kho, đang giao",
      delivered: "Giao hàng thành công",
      returning: "Yêu cầu giao lại",
      cancelled: "Hủy giao hàng",
      returned: "Đã hoàn hàng",
      failed: "Giao thất bại",
    };
    const res = await fetch(`/api/shippings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        event: { status, description: labels[status], location: "Hệ thống" },
      }),
    });
    if (res.ok) load();
  };

  const saveEdit = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/shippings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditing(false);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const removeShipping = async () => {
    if (!id) return;
    if (!confirm("Xoá vận đơn này?")) return;
    const res = await fetch(`/api/shippings/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/shipping/orders");
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="animate-spin h-8 w-8 border-2 border-[#0088FF] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!shipping) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-500">
        <p>Không tìm thấy vận đơn.</p>
        <Link href="/shipping/orders" className="mt-3 text-[#0088FF] hover:underline">← Quay lại danh sách</Link>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/shipping/orders" className="p-2 hover:bg-slate-100 rounded">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-800">{shipping.tracking_code}</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[shipping.status]}`}>
                {STATUS_LABEL[shipping.status]}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Tạo lúc {fmtDateTime(shipping.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="p-2 hover:bg-slate-100 rounded" title="In">
            <Printer className="w-4 h-4 text-slate-500" />
          </button>
          <button onClick={() => setEditing((v) => !v)} className="p-2 hover:bg-slate-100 rounded" title="Sửa">
            <Edit3 className="w-4 h-4 text-slate-500" />
          </button>
          <button onClick={removeShipping} className="p-2 hover:bg-slate-100 rounded" title="Hủy/Xoá">
            <XCircle className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </header>

      <div className="p-6 grid grid-cols-12 gap-6">
        {/* Left: Customer + Status actions + Timeline */}
        <div className="col-span-8 space-y-4">
          {/* Customer info */}
          <section className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <UserIcon className="w-4 h-4" /> Thông tin người nhận
            </h3>
            {editing ? (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Họ tên">
                  <input
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
                    value={editForm.customer_name ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
                  />
                </Field>
                <Field label="Số điện thoại">
                  <input
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
                    value={editForm.customer_phone ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, customer_phone: e.target.value })}
                  />
                </Field>
                <Field label="Tỉnh/TP" full>
                  <input
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
                    value={editForm.province ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, province: e.target.value })}
                  />
                </Field>
                <Field label="Địa chỉ" full>
                  <input
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-[#0088FF] outline-none"
                    value={editForm.shipping_address ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, shipping_address: e.target.value })}
                  />
                </Field>
                <div className="col-span-2 flex gap-2 mt-2">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0088FF] text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" /> {saving ? "Đang lưu..." : "Lưu"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-3 py-1.5 border border-slate-300 rounded text-sm hover:bg-slate-50"
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow icon={<UserIcon className="w-4 h-4 text-slate-400" />} label="Họ tên" value={shipping.customer_name} />
                <InfoRow icon={<Phone className="w-4 h-4 text-slate-400" />} label="Số điện thoại" value={shipping.customer_phone || "—"} />
                <InfoRow
                  icon={<Building2 className="w-4 h-4 text-slate-400" />}
                  label="Tỉnh/TP"
                  value={shipping.province || "—"}
                />
                <InfoRow
                  icon={<MapPin className="w-4 h-4 text-slate-400" />}
                  label="Địa chỉ"
                  value={[shipping.shipping_address, shipping.ward, shipping.district, shipping.province].filter(Boolean).join(", ") || "—"}
                />
              </div>
            )}
          </section>

          {/* Status actions */}
          <section className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Cập nhật trạng thái</h3>
            <div className="flex flex-wrap gap-2">
              {NEXT_ACTIONS.map((a) => (
                <button
                  key={a.v}
                  onClick={() => updateStatus(a.v)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-white text-sm rounded transition ${a.color}`}
                >
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          </section>

          {/* Timeline */}
          <section className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Lịch sử vận chuyển</h3>
            {(shipping.events ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">Chưa có sự kiện nào.</p>
            ) : (
              <ol className="space-y-3">
                {(shipping.events ?? []).map((e, idx) => (
                  <li key={e.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${idx === 0 ? "bg-[#0088FF]" : "bg-slate-300"}`} />
                      {idx < (shipping.events?.length ?? 0) - 1 && (
                        <div className="w-px flex-1 bg-slate-200 my-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <p className="text-sm font-medium text-slate-800">{e.description || e.status}</p>
                      {e.location && <p className="text-xs text-slate-500">{e.location}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(e.occurred_at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Right: Summary */}
        <div className="col-span-4 space-y-4">
          <section className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Thông tin vận đơn</h3>
            <dl className="text-sm space-y-3">
              <Row label="Mã vận đơn" value={shipping.tracking_code} mono />
              <Row label="Đối tác" value={shipping.partner || "—"} />
              <Row label="Dịch vụ" value={shipping.partner_service || "—"} />
              <Row label="Trạng thái" value={STATUS_LABEL[shipping.status]} />
              <Row label="Chi nhánh" value={shipping.branch || "—"} />
              <Row label="Nhân viên" value={shipping.staff || "—"} />
              <Row label="Đóng gói" value={fmtDateTime(shipping.packed_at)} />
              <Row label="Lấy hàng" value={fmtDateTime(shipping.picked_up_at)} />
              <Row label="Giao hàng" value={fmtDateTime(shipping.delivered_at)} />
              <Row label="Huỷ" value={fmtDateTime(shipping.cancelled_at)} />
            </dl>
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Tiền & phí</h3>
            <dl className="text-sm space-y-3">
              <Row label="Tiền thu hộ (COD)" value={`${fmt.format(shipping.cod_amount)} đ`} />
              <Row label="Phí vận chuyển" value={`${fmt.format(shipping.shipping_fee)} đ`} />
              <Row label="Khối lượng" value={`${shipping.weight} g`} />
              <div className="pt-3 border-t border-slate-100 flex justify-between font-semibold text-slate-800">
                <span>Tổng cộng</span>
                <span>{fmt.format(shipping.cod_amount + shipping.shipping_fee)} đ</span>
              </div>
            </dl>
          </section>

          {shipping.note && (
            <section className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                <Info className="w-4 h-4" /> Ghi chú
              </h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{shipping.note}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm text-slate-800 font-medium">{value}</p>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-slate-800 font-medium text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
