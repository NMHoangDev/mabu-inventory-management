"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Package } from "lucide-react";
import { SupplierProductSearch, type SupplierProductHit } from "@/components/suppliers/SupplierProductSearch";

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
  onSaved: (supplier: { id: string; name: string; phone: string; code: string }) => void;
  /** Truyền id để mở modal ở chế độ sửa — modal tự fetch chi tiết nhà cung cấp. */
  supplierId?: string | null;
}

const blankForm: SupplierFormData = {
  name: "",
  code: "",
  contact_name: "",
  phone: "",
  email: "",
  tax_code: "",
  address: "",
  city: "",
  note: ""
};

export function AddSupplierModal({ onClose, onSaved, supplierId }: AddSupplierModalProps) {
  const isEdit = !!supplierId;
  const [form, setForm] = useState<SupplierFormData>(blankForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [selectedProducts, setSelectedProducts] = useState<Map<string, SupplierProductHit>>(new Map());
  const [originalProductIds, setOriginalProductIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      if (isEdit && supplierId) {
        try {
          const res = await fetch(`/api/suppliers/${supplierId}`);
          const d = await res.json();
          if (!cancelled && res.ok) {
            setForm({
              name: d.name ?? "",
              code: d.code ?? "",
              contact_name: d.contact_name ?? "",
              phone: d.phone ?? "",
              email: d.email ?? "",
              tax_code: d.tax_code ?? "",
              address: d.address ?? "",
              city: d.city ?? "",
              note: d.note ?? ""
            });
          } else if (!cancelled) {
            setError(d?.error ?? "Không tải được thông tin nhà cung cấp.");
          }
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : "Không tải được thông tin nhà cung cấp.");
        }
        try {
          const res = await fetch(`/api/suppliers/${supplierId}/products`);
          const rows = await res.json();
          if (!cancelled && Array.isArray(rows)) {
            const map = new Map<string, SupplierProductHit>();
            rows.forEach((row: { product_id: string; product_name: string; sku: string; unit: string; image_url: string }) => {
              map.set(row.product_id, {
                id: row.product_id,
                name: row.product_name,
                sku: row.sku,
                unit: row.unit,
                price: 0,
                image_url: row.image_url
              });
            });
            setSelectedProducts(map);
            setOriginalProductIds(new Set(map.keys()));
          }
        } catch {
          /* giữ danh sách sản phẩm rỗng nếu tải lỗi, không chặn việc sửa NCC */
        }
      } else {
        try {
          const res = await fetch("/api/suppliers/next-code");
          const d = await res.json();
          if (!cancelled) setForm((f) => ({ ...f, code: d?.code ?? "" }));
        } catch {
          /* giữ code rỗng, user có thể tự nhập */
        }
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [isEdit, supplierId]);

  function addSelectedProduct(hit: SupplierProductHit) {
    setSelectedProducts((prev) => {
      const next = new Map(prev);
      next.set(hit.id, hit);
      return next;
    });
  }

  function removeSelectedProduct(id: string) {
    setSelectedProducts((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

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
      const url = isEdit ? `/api/suppliers/${supplierId}` : "/api/suppliers";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không lưu được nhà cung cấp.");

      const savedSupplierId = data.id as string;
      const selectedIds = new Set(selectedProducts.keys());
      const toAdd = Array.from(selectedIds).filter((id) => !originalProductIds.has(id));
      const toRemove = Array.from(originalProductIds).filter((id) => !selectedIds.has(id));
      if (toAdd.length > 0) {
        await fetch(`/api/suppliers/${savedSupplierId}/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_ids: toAdd })
        }).catch(() => undefined);
      }
      if (toRemove.length > 0) {
        await Promise.all(
          toRemove.map((id) =>
            fetch(`/api/suppliers/${savedSupplierId}/products/${id}`, { method: "DELETE" }).catch(() => undefined)
          )
        );
      }

      onSaved({ id: data.id, name: data.name, phone: data.phone ?? "", code: data.code ?? "" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi lưu nhà cung cấp.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}
          </h2>
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

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Sản phẩm cung cấp
              </label>
              <SupplierProductSearch
                placeholder="Tìm sản phẩm theo tên hoặc SKU để thêm..."
                excludeIds={Array.from(selectedProducts.keys())}
                onSelect={addSelectedProduct}
              />
              {selectedProducts.size > 0 ? (
                <div className="mt-2 border border-slate-200 rounded divide-y max-h-48 overflow-y-auto">
                  {Array.from(selectedProducts.values()).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="flex items-center gap-2">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="w-8 h-8 object-cover rounded border flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 bg-slate-100 rounded border flex items-center justify-center text-slate-300 flex-shrink-0">
                            <Package className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-slate-800">{p.name}</div>
                          <div className="text-xs text-slate-500">SKU: {p.sku || "—"}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSelectedProduct(p.id)}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Chưa chọn sản phẩm nào.</p>
              )}
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
              {saving ? "Đang lưu..." : isEdit ? "Cập nhật" : "Lưu nhà cung cấp"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
