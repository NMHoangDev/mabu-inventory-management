"use client";

import { useEffect, useRef, useState } from "react";

export interface CustomerAddress {
  is_default: boolean;
  recipient_name: string;
  phone: string;
  address: string;
  ward: string;
  district: string;
  city: string;
  region: string;
  postal_code: string;
  address_type: "shipping" | "billing" | "other";
}

export interface CustomerFormData {
  name: string;
  code: string;
  phone: string;
  email: string;
  gender: "male" | "female" | "other" | "";
  birthday: string;
  company: string;
  tax_code: string;
  website: string;
  description: string;
  tags: string[];
  group_id: string;
  assigner_id: string;
  addresses: CustomerAddress[];
}

export interface CustomerGroup {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Partial<CustomerFormData & { id: string }>;
  groups: CustomerGroup[];
}

function emptyForm(): CustomerFormData {
  return {
    name: "",
    code: "",
    phone: "",
    email: "",
    gender: "",
    birthday: "",
    company: "",
    tax_code: "",
    website: "",
    description: "",
    tags: [],
    group_id: "",
    assigner_id: "",
    addresses: [
      {
        is_default: true,
        recipient_name: "",
        phone: "",
        address: "",
        ward: "",
        district: "",
        city: "",
        region: "",
        postal_code: "",
        address_type: "shipping",
      },
    ],
  };
}

export function CustomerFormModal({ open, onClose, onSuccess, initialData, groups }: Props) {
  const [form, setForm] = useState<CustomerFormData>(emptyForm);
  const [addressEnabled, setAddressEnabled] = useState(
    Boolean(initialData?.addresses?.length)
  );
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);

  const isEdit = Boolean(initialData?.id);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          name: initialData.name ?? "",
          code: initialData.code ?? "",
          phone: initialData.phone ?? "",
          email: initialData.email ?? "",
          gender: (initialData.gender as CustomerFormData["gender"]) ?? "",
          birthday: initialData.birthday ?? "",
          company: initialData.company ?? "",
          tax_code: initialData.tax_code ?? "",
          website: initialData.website ?? "",
          description: initialData.description ?? "",
          tags: initialData.tags ?? [],
          group_id: initialData.group_id ?? "",
          assigner_id: initialData.assigner_id ?? "",
          addresses:
            initialData.addresses && initialData.addresses.length > 0
              ? initialData.addresses
              : [
                  {
                    is_default: true,
                    recipient_name: "",
                    phone: "",
                    address: "",
                    ward: "",
                    district: "",
                    city: "",
                    region: "",
                    postal_code: "",
                    address_type: "shipping",
                  },
                ],
        });
        setAddressEnabled(Boolean(initialData.addresses?.length));
        setTags(initialData.tags ?? []);
      } else {
        setForm(emptyForm());
        setTags([]);
        setAddressEnabled(false);
      }
      setError("");
    }
  }, [open, initialData]);

  if (!open) return null;

  function setAddr(idx: number, field: keyof CustomerAddress, value: string | boolean) {
    setForm((prev) => {
      const updated = [...prev.addresses];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, addresses: updated };
    });
  }

  function addAddress() {
    setForm((prev) => ({
      ...prev,
      addresses: [
        ...prev.addresses,
        {
          is_default: prev.addresses.length === 0,
          recipient_name: "",
          phone: "",
          address: "",
          ward: "",
          district: "",
          city: "",
          region: "",
          postal_code: "",
          address_type: "shipping",
        },
      ],
    }));
  }

  function removeAddress(idx: number) {
    setForm((prev) => ({
      ...prev,
      addresses: prev.addresses.filter((_, i) => i !== idx),
    }));
  }

  function setDefault(idx: number) {
    setForm((prev) => ({
      ...prev,
      addresses: prev.addresses.map((a, i) => ({ ...a, is_default: i === idx })),
    }));
  }

  function addTag(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags((t) => [...t, tagInput.trim()]);
      }
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags((t) => t.filter((x) => x !== tag));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Tên khách hàng là bắt buộc.");
      return;
    }
    if (!form.group_id) {
      setError("Vui lòng chọn nhóm khách hàng.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const payload = {
        ...form,
        tags,
        addresses: addressEnabled
          ? form.addresses.map((a) => ({
              ...a,
              phone: a.phone || form.phone,
              recipient_name: a.recipient_name || form.name,
            }))
          : [],
      };

      let res: Response;
      if (isEdit) {
        res = await fetch(`/api/customers/${initialData!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Lưu thất bại.");
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError("Đã xảy ra lỗi khi lưu.");
    } finally {
      setSaving(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEdit ? "Chỉnh sửa khách hàng" : "Thêm khách hàng"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 grid grid-cols-12 gap-6">
            {/* Left Column */}
            <div className="col-span-8 space-y-5">
              {/* Thông tin chung */}
              <section className="space-y-4">
                <h3 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-2">
                  Thông tin chung
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên khách hàng <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Nhập tên khách hàng"
                    className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mã khách hàng</label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                      placeholder="Tự động tạo nếu bỏ trống"
                      className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nhóm khách hàng <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.group_id}
                      onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Chọn nhóm khách hàng</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="Nhập số điện thoại"
                      className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="Nhập địa chỉ email"
                      className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Toggle Address */}
                <div className="bg-gray-50 -mx-6 px-6 py-5 border-y border-gray-100">
                  <div className="flex items-center mb-4">
                    <button
                      type="button"
                      onClick={() => setAddressEnabled((v) => !v)}
                      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        addressEnabled ? "bg-blue-500" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                          addressEnabled ? "translate-x-5" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <span className="ml-3 text-sm font-medium text-gray-700">Địa chỉ giao hàng</span>
                  </div>

                  {addressEnabled && (
                    <div className="space-y-4">
                      {form.addresses.map((addr, idx) => (
                        <div key={idx} className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setDefault(idx)}
                                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition ${
                                  addr.is_default
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-gray-100 text-gray-500 hover:bg-blue-50"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${addr.is_default ? "bg-blue-500" : "bg-gray-300"}`} />
                                Mặc định
                              </button>
                              {addr.is_default && <span className="text-xs text-gray-400">✓ Địa chỉ mặc định</span>}
                            </div>
                            {form.addresses.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeAddress(idx)}
                                className="text-gray-400 hover:text-red-500 text-xs transition"
                              >
                                ✕ Xoá
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Người nhận</label>
                              <input
                                type="text"
                                value={addr.recipient_name}
                                onChange={(e) => setAddr(idx, "recipient_name", e.target.value)}
                                placeholder="Tên người nhận"
                                className="w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Điện thoại</label>
                              <input
                                type="text"
                                value={addr.phone}
                                onChange={(e) => setAddr(idx, "phone", e.target.value)}
                                placeholder="SĐT người nhận"
                                className="w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Tỉnh/Thành phố - Quận/Huyện
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                              <input
                                type="text"
                                value={addr.city}
                                onChange={(e) => setAddr(idx, "city", e.target.value)}
                                placeholder="Tỉnh / Thành phố"
                                className="w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <input
                                type="text"
                                value={addr.district}
                                onChange={(e) => setAddr(idx, "district", e.target.value)}
                                placeholder="Quận / Huyện"
                                className="w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Địa chỉ cụ thể</label>
                            <input
                              type="text"
                              value={addr.address}
                              onChange={(e) => setAddr(idx, "address", e.target.value)}
                              placeholder="Số nhà, tên đường, tên khu vực"
                              className="w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={addAddress}
                        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium transition"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Thêm địa chỉ khác
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* Thông tin bổ sung */}
              <section className="space-y-4">
                <h3 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-2">
                  Thông tin bổ sung
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày sinh</label>
                    <input
                      type="date"
                      value={form.birthday}
                      onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giới tính</label>
                    <select
                      value={form.gender}
                      onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as CustomerFormData["gender"] }))}
                      className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Chọn giới tính</option>
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                      <option value="other">Khác</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số Fax</label>
                    <input
                      type="text"
                      value={form.company}
                      onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                      placeholder="Số Fax"
                      className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mã số thuế</label>
                    <input
                      type="text"
                      value={form.tax_code}
                      onChange={(e) => setForm((f) => ({ ...f, tax_code: e.target.value }))}
                      placeholder="Nhập mã số thuế"
                      className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                    <input
                      type="text"
                      value={form.website}
                      onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                      placeholder="https://..."
                      className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Công nợ</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Nhập công nợ"
                        className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                  <div className="min-h-[42px] border border-gray-300 rounded-lg shadow-sm px-3 py-2 flex flex-wrap gap-1.5 items-center focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2 py-0.5 rounded-full"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="hover:text-blue-900 leading-none"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={addTag}
                      placeholder={tags.length === 0 ? "Nhập tag, nhấn Enter để thêm" : ""}
                      className="flex-1 min-w-[120px] text-sm bg-transparent focus:outline-none py-0.5"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">Nhấn Enter hoặc dấu phẩy để thêm tag.</p>
                </div>
              </section>
            </div>

            {/* Right Column */}
            <div className="col-span-4 space-y-5">
              <section className="space-y-4">
                <h3 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-2">
                  Thông tin khác
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nhân viên phụ trách</label>
                  <select
                    value={form.assigner_id}
                    onChange={(e) => setForm((f) => ({ ...f, assigner_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Chọn nhân viên</option>
                    <option value="NA">NA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Nhập mô tả"
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tổng chi tiêu
                  </label>
                  <input
                    type="text"
                    value="0"
                    readOnly
                    placeholder="Chưa có dữ liệu"
                    className="w-full border border-gray-200 rounded-lg shadow-sm py-2 px-3 text-sm text-right bg-gray-50 cursor-not-allowed"
                  />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-2">
                  Cài đặt nâng cao
                </h3>
                <p className="text-sm font-medium text-gray-700">Áp dụng ưu đãi</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="discount" value="group" defaultChecked className="text-blue-500 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">Theo nhóm khách hàng</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="discount" value="customer" className="text-blue-500 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">Theo khách hàng</span>
                  </label>
                </div>
              </section>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 shrink-0 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 font-medium text-sm transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
