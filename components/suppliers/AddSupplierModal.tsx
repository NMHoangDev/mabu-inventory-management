"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";

interface SupplierFormData {
  name: string;
  code: string;
  contact_name: string;
  phone: string;
  email: string;
  tax_code: string;
  address: string;
  city: string;
  note: string;
}

interface AddSupplierModalProps {
  onClose: () => void;
  onCreated: (supplier: { id: string; name: string; phone: string; code: string }) => void;
}

export function AddSupplierModal({ onClose, onCreated }: AddSupplierModalProps) {
  const [form, setForm] = useState<SupplierFormData>({
    name: "",
    code: "",
    contact_name: "",
    phone: "",
    email: "",
    tax_code: "",
    address: "",
    city: "",
    note: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/suppliers/next-code")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setForm((f) => ({ ...f, code: d?.code ?? "" }));
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function setField(key: keyof SupplierFormData, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Tên nhà cung cấp là bắt buộc.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tạo được nhà cung cấp.");
      onCreated({ id: data.id, name: data.name, phone: data.phone ?? "", code: data.code ?? "" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi tạo nhà cung cấp.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-slate-800">Thêm nhà cung cấp</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-4 py-2 rounded border border-red-200 bg-red-50 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Mã nhà cung cấp
                </label>
                <input
                  value={form.code}
                  onChange={(e) => setField("code", e.target.value)}
                  disabled={loading}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-slate-50"
                  placeholder={loading ? "Đang tải..." : "Auto"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Tên nhà cung cấp <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Nhập tên nhà cung cấp"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Người liên hệ
                </label>
                <input
                  value={form.contact_name}
                  onChange={(e) => setField("contact_name", e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Người liên hệ"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Số điện thoại
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="0xxxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Mã số thuế
                </label>
                <input
                  value={form.tax_code}
                  onChange={(e) => setField("tax_code", e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Mã số thuế"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Địa chỉ
              </label>
              <input
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Địa chỉ cụ thể"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Tỉnh / Thành phố
                </label>
                <input
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="TP. Hồ Chí Minh"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Ghi chú
                </label>
                <input
                  value={form.note}
                  onChange={(e) => setField("note", e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Ghi chú thêm"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-100"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? "Đang lưu..." : "Lưu nhà cung cấp"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
