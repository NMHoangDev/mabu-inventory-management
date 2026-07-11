"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrencyVND } from "@/lib/shared/format";
import {
  Info,
  HelpCircle,
  ChevronDown,
  MapPinOff,
  MapPin as MapPinIcon,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  CheckCircle2,
  Truck,
} from "lucide-react";

type WeightSource = "order" | "custom";
type DimensionPreset = "default" | "large" | "extra_large";
type RequirementPreset = "view_only" | "no_view" | "try_allowed";

interface PickupAddress {
  id: string;
  label: string;
  address: string;
  is_default?: boolean;
}

interface ShippingSettings {
  id: number;
  weight_source: WeightSource;
  default_weight_g: number;
  default_dimension: DimensionPreset;
  default_requirement: RequirementPreset;
  default_note: string;
  auto_sync_returned_status: boolean;
  auto_sync_cod: boolean;
  pickup_warning_days: number;
  delivery_warning_days: number;
  restricted_zones: string;
  pickup_addresses: PickupAddress[];
  updated_at: string;
}

interface FeeRule {
  id: string;
  name: string;
  carrier: string;
  from_province: string;
  to_province: string;
  base_fee: number;
  per_kg_fee: number;
  free_shipping_threshold: number;
  enabled: boolean;
}

const DIMENSION_OPTIONS: { v: DimensionPreset; label: string }[] = [
  { v: "default", label: "Mặc định - 10 x 10 x 10 cm" },
  { v: "large", label: "Lớn - 30 x 30 x 30 cm" },
  { v: "extra_large", label: "Siêu lớn - 50 x 50 x 50 cm" },
];

const REQUIREMENT_OPTIONS: { v: RequirementPreset; label: string }[] = [
  { v: "view_only", label: "Cho xem hàng, không cho thử" },
  { v: "no_view", label: "Không cho xem hàng" },
  { v: "try_allowed", label: "Cho thử hàng" },
];

const CARRIERS = ["NINJA VAN", "JNT Express", "GHN", "GHTK", "Viettel Post"];

const DEFAULT_FEES: FeeRule[] = [
  {
    id: "1",
    name: "Nội thành HN - NINJA VAN",
    carrier: "NINJA VAN",
    from_province: "Hà Nội",
    to_province: "Hà Nội",
    base_fee: 22000,
    per_kg_fee: 5000,
    free_shipping_threshold: 500000,
    enabled: true,
  },
  {
    id: "2",
    name: "Nội thành HCM - JNT Express",
    carrier: "JNT Express",
    from_province: "TP. Hồ Chí Minh",
    to_province: "TP. Hồ Chí Minh",
    base_fee: 25000,
    per_kg_fee: 6000,
    free_shipping_threshold: 300000,
    enabled: true,
  },
  {
    id: "3",
    name: "Liên tỉnh HN <-> HCM - GHN",
    carrier: "GHN",
    from_province: "Hà Nội",
    to_province: "TP. Hồ Chí Minh",
    base_fee: 45000,
    per_kg_fee: 12000,
    free_shipping_threshold: 1000000,
    enabled: false,
  },
];

export default function ShippingConfigPage() {
  const [tab, setTab] = useState<"general" | "fees">("general");
  const [settings, setSettings] = useState<ShippingSettings | null>(null);
  const [form, setForm] = useState<ShippingSettings | null>(null);
  const [feeRules, setFeeRules] = useState<FeeRule[]>(DEFAULT_FEES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showRestrictedZones, setShowRestrictedZones] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shipping/settings");
      const data = await res.json();
      setSettings(data.settings);
      setForm(data.settings);
      // Trước đây feeRules luôn khởi tạo = DEFAULT_FEES, không hề đọc từ
      // server — mọi chỉnh sửa mất ngay khi rời trang. Giờ đọc từ
      // settings.fee_rules thật; chỉ dùng DEFAULT_FEES làm ví dụ mẫu cho lần
      // đầu chưa từng lưu (mảng rỗng).
      const savedRules: FeeRule[] | undefined = data.settings?.fee_rules;
      setFeeRules(savedRules && savedRules.length > 0 ? savedRules : DEFAULT_FEES);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const apply = async () => {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/shipping/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, fee_rules: feeRules }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Lưu thất bại");
      }
      const saved = await res.json();
      setSettings(saved);
      setForm(saved);
      setSavedAt(saved.updated_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm(settings);
    setError("");
  };

  const addPickup = () => {
    if (!form) return;
    const id = String(Date.now());
    setForm({
      ...form,
      pickup_addresses: [
        ...form.pickup_addresses,
        { id, label: "Kho mới", address: "", is_default: form.pickup_addresses.length === 0 },
      ],
    });
  };

  const updatePickup = (id: string, patch: Partial<PickupAddress>) => {
    if (!form) return;
    setForm({
      ...form,
      pickup_addresses: form.pickup_addresses.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  };

  const removePickup = (id: string) => {
    if (!form) return;
    setForm({
      ...form,
      pickup_addresses: form.pickup_addresses.filter((p) => p.id !== id),
    });
  };

  const setDefaultPickup = (id: string) => {
    if (!form) return;
    setForm({
      ...form,
      pickup_addresses: form.pickup_addresses.map((p) => ({ ...p, is_default: p.id === id })),
    });
  };

  if (loading || !form) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f6f9ff]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f6f9ff]">
      {/* Top bar */}
      <header className="flex justify-between items-center h-16 px-4 w-full sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold text-slate-900">Cấu hình vận chuyển</h1>
        </div>
        <div className="flex items-center gap-3 text-slate-500">
          <div className="flex items-center gap-1.5 text-slate-500 cursor-pointer hover:text-[#005baf]">
            <HelpCircle className="w-5 h-5" />
            <span className="text-sm">Trợ giúp</span>
          </div>
          <div className="flex items-center gap-2 ml-2 cursor-pointer border-l border-slate-200 pl-3">
            <div className="w-8 h-8 rounded-full bg-[#005baf] flex items-center justify-center text-white text-xs font-bold">N</div>
            <span className="text-sm font-medium">NA</span>
            <ChevronDown className="w-5 h-5" />
          </div>
        </div>
      </header>

      <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 mb-6 bg-white rounded-t-xl px-3">
          <button
            onClick={() => setTab("general")}
            className={`px-3 py-4 text-sm font-bold transition-colors ${
              tab === "general"
                ? "text-[#005baf] border-b-2 border-[#005baf]"
                : "text-slate-500 hover:text-[#005baf]"
            }`}
          >
            Cấu hình chung
          </button>
          <button
            onClick={() => setTab("fees")}
            className={`px-3 py-4 text-sm font-bold transition-colors ${
              tab === "fees"
                ? "text-[#005baf] border-b-2 border-[#005baf]"
                : "text-slate-500 hover:text-[#005baf]"
            }`}
          >
            Cấu hình phí vận chuyển
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm mb-4">{error}</div>
        )}

        {tab === "general" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left: Shipping defaults */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-base font-bold mb-2 flex items-center gap-2 text-slate-900">
                Thông tin giao hàng
              </h3>
              <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                Thiết lập mặc định thông tin giao hàng khi gửi hàng sang ĐTVC tích hợp và shipper tự tạo.
              </p>

              <div className="space-y-4 mt-6">
                {/* Weight */}
                <div>
                  <label className="text-sm font-bold text-slate-900 flex items-center gap-1">
                    Khối lượng<span className="text-red-500">*</span>
                    <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                  </label>
                  <div className="space-y-2 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        checked={form.weight_source === "order"}
                        onChange={() => setForm({ ...form, weight_source: "order" })}
                        className="w-4 h-4 text-[#005baf] focus:ring-[#005baf] border-slate-300"
                        type="radio"
                        name="weight_type"
                      />
                      <span className="text-sm group-hover:text-[#005baf] transition-colors">Theo sản phẩm trong đơn hàng</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        checked={form.weight_source === "custom"}
                        onChange={() => setForm({ ...form, weight_source: "custom" })}
                        className="w-4 h-4 text-[#005baf] focus:ring-[#005baf] border-slate-300"
                        type="radio"
                        name="weight_type"
                      />
                      <span className="text-sm group-hover:text-[#005baf] transition-colors">Tùy chỉnh</span>
                    </label>
                  </div>
                  <div className="relative mt-2">
                    <input
                      type="number"
                      min={0}
                      value={form.default_weight_g}
                      onChange={(e) => setForm({ ...form, default_weight_g: Number(e.target.value) || 0 })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-right focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none transition-all"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-2 text-slate-500 text-sm">g</span>
                  </div>
                </div>

                {/* Dimension */}
                <div>
                  <label className="text-sm font-bold text-slate-900">Kích thước</label>
                  <div className="relative mt-1">
                    <select
                      value={form.default_dimension}
                      onChange={(e) => setForm({ ...form, default_dimension: e.target.value as DimensionPreset })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm appearance-none focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none cursor-pointer"
                    >
                      {DIMENSION_OPTIONS.map((o) => (
                        <option key={o.v} value={o.v}>{o.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>

                {/* Requirement */}
                <div>
                  <label className="text-sm font-bold text-slate-900">Yêu cầu</label>
                  <div className="relative mt-1">
                    <select
                      value={form.default_requirement}
                      onChange={(e) => setForm({ ...form, default_requirement: e.target.value as RequirementPreset })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm appearance-none focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none cursor-pointer"
                    >
                      {REQUIREMENT_OPTIONS.map((o) => (
                        <option key={o.v} value={o.v}>{o.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="text-sm font-bold text-slate-900">Ghi chú</label>
                  <textarea
                    value={form.default_note}
                    onChange={(e) => setForm({ ...form, default_note: e.target.value })}
                    placeholder="Nhập ghi chú vận chuyển"
                    rows={3}
                    className="mt-1 w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none transition-all resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Right: Delivery setup */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-base font-bold mb-2 text-slate-900">Thiết lập giao nhận hàng</h3>
              <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                Kết nối các đối tác vận chuyển để tự động gửi yêu cầu giao hàng cho các đơn vận chuyển và nhận cập nhật trạng thái vận đơn ngay trên Sapo.
              </p>

              <div className="mt-6 space-y-4">
                <Toggle
                  checked={form.auto_sync_returned_status}
                  onChange={(v) => setForm({ ...form, auto_sync_returned_status: v })}
                  label='Tự động đồng bộ trạng thái "Hủy giao - đã nhận" với đơn vị vận chuyển'
                />
                <Toggle
                  checked={form.auto_sync_cod}
                  onChange={(v) => setForm({ ...form, auto_sync_cod: v })}
                  label="Tự động đồng bộ tiền thu hộ từ đối tác vận chuyển"
                />

                <div className="space-y-4 pt-2">
                  <NumberField
                    label="Cấu hình số ngày cảnh báo lấy trễ"
                    value={form.pickup_warning_days}
                    onChange={(v) => setForm({ ...form, pickup_warning_days: v })}
                    placeholder="Nhập số ngày"
                  />
                  <NumberField
                    label="Cấu hình số ngày cảnh báo giao trễ"
                    value={form.delivery_warning_days}
                    onChange={(v) => setForm({ ...form, delivery_warning_days: v })}
                    placeholder="Nhập số ngày"
                  />
                </div>

                <div className="pt-3 space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowRestrictedZones((v) => !v)}
                    className="flex items-center gap-2 text-[#005baf] font-medium hover:underline text-sm"
                  >
                    <MapPinOff className="w-5 h-5" />
                    Cấu hình khu vực không giao hàng
                  </button>
                  {showRestrictedZones ? (
                    <textarea
                      value={form.restricted_zones}
                      onChange={(e) => setForm({ ...form, restricted_zones: e.target.value })}
                      placeholder="Mỗi khu vực 1 dòng, vd: Côn Đảo, Lý Sơn, Trường Sa..."
                      rows={3}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#005baf] focus:outline-none"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Tab: Fees
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-base font-bold mb-2 flex items-center gap-2 text-slate-900">
              <Truck className="w-5 h-5 text-[#005baf]" /> Bảng giá vận chuyển
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Thiết lập phí vận chuyển theo từng khu vực và đối tác. Phí sẽ được áp dụng tự động khi tạo vận đơn.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-y border-slate-200">
                  <tr className="text-slate-600 font-medium">
                    <th className="p-3 text-left">Tên quy tắc</th>
                    <th className="p-3 text-left">Đối tác</th>
                    <th className="p-3 text-left">Từ</th>
                    <th className="p-3 text-left">Đến</th>
                    <th className="p-3 text-right">Phí cơ bản</th>
                    <th className="p-3 text-right">Phí / kg</th>
                    <th className="p-3 text-right">Miễn phí từ</th>
                    <th className="p-3 text-center">Bật</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feeRules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-slate-50">
                      <td className="p-2">
                        <input
                          value={rule.name}
                          onChange={(e) => setFeeRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, name: e.target.value } : r)))}
                          className="w-full px-2 py-1 border border-transparent hover:border-slate-200 rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={rule.carrier}
                          onChange={(e) => setFeeRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, carrier: e.target.value } : r)))}
                          className="w-full px-2 py-1 border border-transparent hover:border-slate-200 rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none cursor-pointer"
                        >
                          {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          value={rule.from_province}
                          onChange={(e) => setFeeRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, from_province: e.target.value } : r)))}
                          className="w-full px-2 py-1 border border-transparent hover:border-slate-200 rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={rule.to_province}
                          onChange={(e) => setFeeRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, to_province: e.target.value } : r)))}
                          className="w-full px-2 py-1 border border-transparent hover:border-slate-200 rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={rule.base_fee}
                          onChange={(e) => setFeeRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, base_fee: Number(e.target.value) || 0 } : r)))}
                          className="w-24 px-2 py-1 border border-transparent hover:border-slate-200 rounded text-sm text-right focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={rule.per_kg_fee}
                          onChange={(e) => setFeeRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, per_kg_fee: Number(e.target.value) || 0 } : r)))}
                          className="w-24 px-2 py-1 border border-transparent hover:border-slate-200 rounded text-sm text-right focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={rule.free_shipping_threshold}
                          onChange={(e) => setFeeRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, free_shipping_threshold: Number(e.target.value) || 0 } : r)))}
                          className="w-28 px-2 py-1 border border-transparent hover:border-slate-200 rounded text-sm text-right focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => setFeeRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, enabled: e.target.checked } : r)))}
                          className="w-4 h-4 text-[#005baf] focus:ring-[#005baf] border-slate-300 rounded"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <button
                          onClick={() => setFeeRules((rs) => rs.filter((r) => r.id !== rule.id))}
                          className="p-1 hover:bg-red-50 rounded"
                          title="Xoá"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setFeeRules((rs) => [...rs, {
                id: String(Date.now()),
                name: "Quy tắc mới",
                carrier: "NINJA VAN",
                from_province: "",
                to_province: "",
                base_fee: 0,
                per_kg_fee: 0,
                free_shipping_threshold: 0,
                enabled: true,
              }])}
              className="mt-4 flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
            >
              <Plus className="w-4 h-4" /> Thêm quy tắc
            </button>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-slate-600">
              <strong className="text-[#005baf]">Mẹo:</strong> Có {feeRules.filter((r) => r.enabled).length} / {feeRules.length} quy tắc đang bật.
              Tổng số tiền vận chuyển dự kiến = <span className="font-mono">{formatCurrencyVND(feeRules.reduce((a, r) => a + r.base_fee, 0))}</span> (phí cơ bản).
            </div>
          </div>
        )}

        {/* Pickup addresses (only on general tab) */}
        {tab === "general" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mt-6">
            <h3 className="text-base font-bold mb-2 text-slate-900 flex items-center gap-2">
              <MapPinIcon className="w-5 h-5 text-[#005baf]" />
              Địa chỉ lấy hàng
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Quản lý các địa chỉ kho/cửa hàng mà đối tác vận chuyển sẽ đến lấy hàng.
            </p>

            {form.pickup_addresses.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center text-slate-400 text-sm">
                Chưa có địa chỉ lấy hàng nào. Nhấn "Thêm địa chỉ" để tạo.
              </div>
            ) : (
              <div className="space-y-3">
                {form.pickup_addresses.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <input
                      type="radio"
                      checked={p.is_default ?? false}
                      onChange={() => setDefaultPickup(p.id)}
                      className="w-4 h-4 text-[#005baf] focus:ring-[#005baf]"
                      title="Đặt làm mặc định"
                    />
                    <div className="flex-1 grid grid-cols-3 gap-3">
                      <input
                        value={p.label}
                        onChange={(e) => updatePickup(p.id, { label: e.target.value })}
                        placeholder="Tên kho (VD: Kho HCM)"
                        className="px-2 py-1 border border-slate-200 rounded text-sm bg-white focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
                      />
                      <input
                        value={p.address}
                        onChange={(e) => updatePickup(p.id, { address: e.target.value })}
                        placeholder="Địa chỉ đầy đủ"
                        className="col-span-2 px-2 py-1 border border-slate-200 rounded text-sm bg-white focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
                      />
                    </div>
                    {p.is_default && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Mặc định
                      </span>
                    )}
                    <button
                      onClick={() => removePickup(p.id)}
                      className="p-1 hover:bg-red-50 rounded"
                      title="Xoá"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={addPickup}
              className="mt-4 flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
            >
              <Plus className="w-4 h-4" /> Thêm địa chỉ
            </button>
          </div>
        )}

        {/* Help banner */}
        <div className="mt-6 w-full bg-blue-50 rounded-full px-6 py-3 flex items-center gap-3 border border-blue-100">
          <HelpCircle className="w-6 h-6 text-[#005baf]" />
          <p className="text-sm text-slate-900 flex-1">
            Bạn có thể xem thêm hướng dẫn về cấu hình vận chuyển{" "}
            <Link href="#" className="text-[#005baf] font-bold hover:underline">Tại đây</Link>
          </p>
        </div>

        {/* Footer buttons */}
        <div className="w-full flex justify-end gap-3 mt-3">
          {savedAt && (
            <span className="text-xs text-slate-500 mr-auto self-center">
              Đã lưu lúc {new Date(savedAt).toLocaleString("vi-VN")}
            </span>
          )}
          <button
            onClick={reset}
            disabled={saving}
            className="flex items-center gap-1.5 px-6 py-2.5 border border-slate-300 rounded-lg text-slate-600 font-bold bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" /> Hủy
          </button>
          <button
            onClick={apply}
            disabled={saving}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-[#005baf] text-white rounded-lg font-bold shadow-lg shadow-blue-500/20 hover:bg-[#004a93] active:scale-95 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? "Đang áp dụng..." : "Áp dụng"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex-1 flex items-center gap-2">
        <span className="text-sm">{label}</span>
        <Info className="w-4 h-4 text-[#005baf] cursor-help" />
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-block w-10 h-5 rounded-full transition-colors ${checked ? "bg-[#005baf]" : "bg-slate-300"}`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  );
}

function NumberField({ label, value, onChange, placeholder }: { label: string; value: number; onChange: (v: number) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-900 flex items-center gap-1">
        {label}
        <Info className="w-4 h-4 text-[#005baf]" />
      </label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        placeholder={placeholder}
        className="mt-1 w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
      />
    </div>
  );
}
