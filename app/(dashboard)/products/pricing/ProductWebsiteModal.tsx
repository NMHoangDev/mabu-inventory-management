"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, X, ArrowUp, ArrowDown } from "lucide-react";

interface ProductImage {
  url: string;
  alt: string;
}

interface Props {
  productId: string;
  productName: string;
  initialSlug: string;
  initialSeoTitle: string;
  initialSeoDescription: string;
  onClose: () => void;
  onSaved: (patch: { slug: string; seo_title: string; seo_description: string }) => void;
}

export function ProductWebsiteModal({
  productId,
  productName,
  initialSlug,
  initialSeoTitle,
  initialSeoDescription,
  onClose,
  onSaved,
}: Props) {
  const [slug, setSlug] = useState(initialSlug);
  const [seoTitle, setSeoTitle] = useState(initialSeoTitle);
  const [seoDescription, setSeoDescription] = useState(initialSeoDescription);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/products/${productId}/images`)
      .then((r) => r.json())
      .then((d) => setImages((d.images ?? []).map((i: any) => ({ url: i.url, alt: i.alt ?? "" }))))
      .catch(() => undefined)
      .finally(() => setLoadingImages(false));
  }, [productId]);

  function moveImage(index: number, dir: -1 | 1) {
    setImages((current) => {
      const next = [...current];
      const target = index + dir;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const patchRes = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, seo_title: seoTitle, seo_description: seoDescription }),
      });
      if (!patchRes.ok) {
        const data = await patchRes.json().catch(() => ({}));
        throw new Error(data.error || "Lưu thông tin website thất bại.");
      }
      const imagesRes = await fetch(`/api/products/${productId}/images`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: images.filter((i) => i.url.trim()) }),
      });
      if (!imagesRes.ok) {
        const data = await imagesRes.json().catch(() => ({}));
        throw new Error(data.error || "Lưu ảnh sản phẩm thất bại.");
      }
      onSaved({ slug, seo_title: seoTitle, seo_description: seoDescription });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đã xảy ra lỗi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Cài đặt website — {productName}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Slug (đường dẫn URL)</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="ao-thun-nam"
            />
            <p className="mt-1 text-xs text-slate-400">/products/{slug || "..."}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tiêu đề SEO</label>
            <input
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Mô tả SEO</label>
            <textarea
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">Ảnh sản phẩm (URL)</label>
              <button
                onClick={() => setImages((c) => [...c, { url: "", alt: "" }])}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Thêm ảnh
              </button>
            </div>
            {loadingImages ? (
              <div className="flex justify-center py-4 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {images.map((img, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {img.url ? (
                      <img src={img.url} alt="" className="h-10 w-10 shrink-0 rounded border object-cover" />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded border bg-slate-50" />
                    )}
                    <input
                      value={img.url}
                      onChange={(e) =>
                        setImages((c) => c.map((it, idx) => (idx === i ? { ...it, url: e.target.value } : it)))
                      }
                      placeholder="https://..."
                      className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                    />
                    <button onClick={() => moveImage(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setImages((c) => c.filter((_, idx) => idx !== i))}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {images.length === 0 && <p className="text-xs text-slate-400">Chưa có ảnh nào.</p>}
              </div>
            )}
          </div>

          {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
