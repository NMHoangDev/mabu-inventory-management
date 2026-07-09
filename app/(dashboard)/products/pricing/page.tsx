"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Save, Search, Settings2 } from "lucide-react";
import { ProductWebsiteModal } from "./ProductWebsiteModal";

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category_name: string | null;
  cost_price: number;
  compare_at_price: number; // giá sĩ
  price: number; // giá lẻ
  published: boolean;
  slug: string;
  seo_title: string;
  seo_description: string;
}

type PriceField = "cost_price" | "compare_at_price" | "price";

export default function ProductPricingPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; kind: "ok" | "error" } | null>(null);
  // Chỉnh giá tại chỗ (inline) — key = `${productId}:${field}`.
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [websiteModalRow, setWebsiteModalRow] = useState<ProductRow | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setRows(
            data.map((p: any) => ({
              id: p.id,
              sku: p.sku || "",
              name: p.name || "",
              unit: p.unit || "",
              category_name: p.category_name ?? null,
              cost_price: Number(p.cost_price) || 0,
              compare_at_price: Number(p.compare_at_price) || 0,
              price: Number(p.price) || 0,
              published: Boolean(p.published_at),
              slug: p.slug || "",
              seo_title: p.seo_title || "",
              seo_description: p.seo_description || ""
            }))
          );
        } else {
          setError(typeof data?.error === "string" ? data.error : "Không tải được danh sách sản phẩm.");
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Lỗi mạng."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q));
  }, [rows, search]);

  function fieldValue(row: ProductRow, field: PriceField): number {
    const key = `${row.id}:${field}`;
    return edits[key] !== undefined ? edits[key] : row[field];
  }

  function setFieldValue(row: ProductRow, field: PriceField, value: number) {
    setEdits((prev) => ({ ...prev, [`${row.id}:${field}`]: value }));
  }

  function isDirty(row: ProductRow): boolean {
    return (["cost_price", "compare_at_price", "price"] as PriceField[]).some(
      (f) => edits[`${row.id}:${f}`] !== undefined && edits[`${row.id}:${f}`] !== row[f]
    );
  }

  async function save(row: ProductRow) {
    setSavingId(row.id);
    setFlash(null);
    const payload = {
      cost_price: fieldValue(row, "cost_price"),
      compare_at_price: fieldValue(row, "compare_at_price"),
      price: fieldValue(row, "price")
    };
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Lưu giá thất bại.");
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...payload } : r)));
      setEdits((prev) => {
        const next = { ...prev };
        delete next[`${row.id}:cost_price`];
        delete next[`${row.id}:compare_at_price`];
        delete next[`${row.id}:price`];
        return next;
      });
      setFlash({ id: row.id, kind: "ok" });
    } catch {
      setFlash({ id: row.id, kind: "error" });
    } finally {
      setSavingId(null);
      setTimeout(() => setFlash(null), 2000);
    }
  }

  async function togglePublished(row: ProductRow) {
    setTogglingId(row.id);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !row.published })
      });
      if (!res.ok) throw new Error("Cập nhật hiển thị thất bại.");
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, published: !r.published } : r)));
    } catch {
      setFlash({ id: row.id, kind: "error" });
      setTimeout(() => setFlash(null), 2000);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Bảng giá</div>
            <h2 className="mt-1 text-2xl font-semibold">Quản lý Bảng giá</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Giá vốn / giá sĩ / giá lẻ của toàn bộ sản phẩm — sửa trực tiếp và lưu tại đây.
            </p>
          </div>
          <Link href="/products" className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted">
            Quay lại sản phẩm
          </Link>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc SKU..."
              className="w-full rounded border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="p-3 font-semibold text-slate-600">SKU</th>
                  <th className="p-3 font-semibold text-slate-600">Sản phẩm</th>
                  <th className="p-3 font-semibold text-slate-600">Danh mục</th>
                  <th className="p-3 text-right font-semibold text-slate-600">Giá vốn</th>
                  <th className="p-3 text-right font-semibold text-slate-600">Giá sĩ</th>
                  <th className="p-3 text-right font-semibold text-slate-600">Giá lẻ</th>
                  <th className="p-3 text-center font-semibold text-slate-600">Website</th>
                  <th className="p-3 w-16"></th>
                  <th className="p-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-500">
                      Không có sản phẩm nào khớp.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs">{row.sku || "—"}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-800">{row.name}</div>
                        <div className="text-xs text-slate-400">{row.unit}</div>
                      </td>
                      <td className="p-3 text-slate-500">{row.category_name || "—"}</td>
                      <PriceCell row={row} field="cost_price" value={fieldValue(row, "cost_price")} onChange={setFieldValue} />
                      <PriceCell row={row} field="compare_at_price" value={fieldValue(row, "compare_at_price")} onChange={setFieldValue} />
                      <PriceCell row={row} field="price" value={fieldValue(row, "price")} onChange={setFieldValue} />
                      <td className="p-3 text-center">
                        <button
                          onClick={() => togglePublished(row)}
                          disabled={togglingId === row.id}
                          title={row.published ? "Đang hiển thị trên website — bấm để ẩn" : "Đang ẩn — bấm để hiển thị trên website"}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                            row.published ? "bg-primary" : "bg-slate-300"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              row.published ? "translate-x-[18px]" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setWebsiteModalRow(row)}
                          title="Cài đặt slug / SEO / ảnh"
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        {isDirty(row) ? (
                          <button
                            onClick={() => save(row)}
                            disabled={savingId === row.id}
                            className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {savingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Lưu
                          </button>
                        ) : flash?.id === row.id ? (
                          <span className={`text-xs font-medium ${flash.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}>
                            {flash.kind === "ok" ? "Đã lưu" : "Lỗi"}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {websiteModalRow && (
        <ProductWebsiteModal
          productId={websiteModalRow.id}
          productName={websiteModalRow.name}
          initialSlug={websiteModalRow.slug}
          initialSeoTitle={websiteModalRow.seo_title}
          initialSeoDescription={websiteModalRow.seo_description}
          onClose={() => setWebsiteModalRow(null)}
          onSaved={(patch) =>
            setRows((prev) => prev.map((r) => (r.id === websiteModalRow.id ? { ...r, ...patch } : r)))
          }
        />
      )}
    </section>
  );
}

function PriceCell({
  row,
  field,
  value,
  onChange
}: {
  row: ProductRow;
  field: PriceField;
  value: number;
  onChange: (row: ProductRow, field: PriceField, value: number) => void;
}) {
  return (
    <td className="p-2 text-right">
      <input
        type="number"
        min={0}
        value={value || ""}
        onChange={(e) => onChange(row, field, Math.max(0, Number(e.target.value) || 0))}
        className="w-28 rounded border border-transparent px-2 py-1 text-right text-sm hover:border-slate-300 focus:border-primary focus:outline-none"
        placeholder="0"
      />
    </td>
  );
}
