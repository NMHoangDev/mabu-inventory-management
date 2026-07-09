"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Store } from "lucide-react";

interface SiteSettings {
  store_name: string;
  banner_url: string;
  hero_title: string;
  hero_subtitle: string;
  announcement: string;
  contact_phone: string;
  contact_address: string;
  featured_category_ids: string[];
  featured_product_ids: string[];
}

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  product_count: number;
}

interface ProductOption {
  id: string;
  name: string;
  slug: string;
}

const EMPTY: SiteSettings = {
  store_name: "",
  banner_url: "",
  hero_title: "",
  hero_subtitle: "",
  announcement: "",
  contact_phone: "",
  contact_address: "",
  featured_category_ids: [],
  featured_product_ids: [],
};

export default function StorefrontSettingsPage() {
  const [form, setForm] = useState<SiteSettings>(EMPTY);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/storefront").then((r) => r.json()),
      fetch("/api/storefront/categories").then((r) => r.json()),
      fetch("/api/storefront/products?page_size=100").then((r) => r.json()),
    ])
      .then(([s, c, p]) => {
        if (s?.settings) setForm(s.settings);
        setCategories(c.categories ?? []);
        setProducts(p.products ?? []);
      })
      .catch(() => setError("Không tải được cấu hình."))
      .finally(() => setLoading(false));
  }, []);

  function toggleId(key: "featured_category_ids" | "featured_product_ids", id: string) {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id],
    }));
  }

  async function handleSave() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const res = await fetch("/api/settings/storefront", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lưu thất bại.");
      setForm(data.settings);
      setNotice("Đã lưu cấu hình website.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="panel flex min-h-[300px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Cấu hình website bán hàng</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Nội dung hiển thị ở trang chủ storefront (banner, thông tin liên hệ, sản phẩm/danh mục nổi bật).
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">{error}</div>}
      {notice && <div className="rounded-md bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-700">{notice}</div>}

      <div className="panel space-y-4 p-5">
        <h2 className="section-title">Thông tin chung</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Tên cửa hàng</label>
            <input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} className="field" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Ảnh banner (URL)</label>
            <input value={form.banner_url} onChange={(e) => setForm({ ...form, banner_url: e.target.value })} className="field" placeholder="https://..." />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Số điện thoại liên hệ</label>
            <input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className="field" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Địa chỉ</label>
            <input value={form.contact_address} onChange={(e) => setForm({ ...form, contact_address: e.target.value })} className="field" />
          </div>
        </div>
      </div>

      <div className="panel space-y-4 p-5">
        <h2 className="section-title">Trang chủ</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">Tiêu đề banner</label>
          <input value={form.hero_title} onChange={(e) => setForm({ ...form, hero_title: e.target.value })} className="field" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Phụ đề banner</label>
          <input value={form.hero_subtitle} onChange={(e) => setForm({ ...form, hero_subtitle: e.target.value })} className="field" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Thông báo (hiện dưới banner, để trống nếu không cần)</label>
          <input value={form.announcement} onChange={(e) => setForm({ ...form, announcement: e.target.value })} className="field" />
        </div>
      </div>

      <div className="panel space-y-3 p-5">
        <h2 className="section-title">Danh mục nổi bật</h2>
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có danh mục nào có sản phẩm hiển thị trên website.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => toggleId("featured_category_ids", c.id)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  form.featured_category_ids.includes(c.id) ? "border-primary bg-primary/10 text-primary font-medium" : ""
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel space-y-3 p-5">
        <h2 className="section-title">Sản phẩm nổi bật</h2>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có sản phẩm nào hiển thị trên website.</p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={form.featured_product_ids.includes(p.id)}
                  onChange={() => toggleId("featured_product_ids", p.id)}
                />
                {p.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Đang lưu..." : "Lưu cấu hình"}
        </button>
      </div>
    </div>
  );
}
