"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Loader2,
  Package,
  X
} from "lucide-react";

interface ProductHit {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  current_cost: number;
}

interface DraftItem {
  rowKey: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  current_cost: number;
  new_cost: number;
  note: string;
}

const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function parseNum(text: string): number {
  const v = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(v) ? v : 0;
}

export default function NewCostAdjustmentPage() {
  const router = useRouter();

  const [code, setCode] = useState("CPV00001");
  const [codeLoading, setCodeLoading] = useState(true);
  const [branch, setBranch] = useState("Chi nhánh mặc định");
  const [staff, setStaff] = useState("");
  const [staffOptions, setStaffOptions] = useState<{ id: string; full_name: string }[]>([]);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [items, setItems] = useState<DraftItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductHit[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);
  const [multiSelected, setMultiSelected] = useState<Map<string, ProductHit>>(new Map());
  const productBoxRef = useRef<HTMLDivElement | null>(null);
  const productInputRef = useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/staff")
      .then((r) => r.json())
      .then((d) => setStaffOptions(Array.isArray(d?.staff) ? d.staff : []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCodeLoading(true);
    fetch("/api/cost-adjustments/next-code")
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.code) setCode(d.code); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setCodeLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Chế độ chọn nhiều cho phép duyệt sản phẩm ngay cả khi chưa gõ gì; chế độ
    // thường bắt buộc gõ tìm kiếm (giữ hành vi cũ).
    if (!productQuery.trim() && !multiSelect) { setProductResults([]); return; }
    let cancelled = false;
    setProductLoading(true);
    // Debounce 220ms giống /orders/new — tránh bắn 1 request mỗi phím gõ.
    const timer = setTimeout(() => {
      fetch(`/api/cost-adjustments/products-search?q=${encodeURIComponent(productQuery)}&limit=20`)
        .then(async (r) => {
          const d = await r.json().catch(() => null);
          if (!r.ok) throw new Error(d?.error ?? "Không tìm được sản phẩm.");
          return d;
        })
        .then((d) => { if (!cancelled) setProductResults(Array.isArray(d) ? d : []); })
        .catch(() => { if (!cancelled) setProductResults([]); })
        .finally(() => { if (!cancelled) setProductLoading(false); });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [productQuery, multiSelect]);

  const visibleProductResults = useMemo(
    () => productResults.filter((p) => !items.some((it) => it.product_id === p.product_id)),
    [productResults, items]
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (productBoxRef.current && !productBoxRef.current.contains(e.target as Node)) {
        setProductResults([]);
        setMultiSelect(false);
        setMultiSelected(new Map());
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((p) => p.map((it) => it.rowKey === key ? { ...it, ...patch } : it));
  }

  function removeItem(key: string) {
    setItems((p) => p.filter((it) => it.rowKey !== key));
  }

  function hitToDraftItem(hit: ProductHit): DraftItem {
    return {
      rowKey: `adj-${hit.product_id}-${Math.random().toString(36).slice(2, 7)}`,
      product_id: hit.product_id,
      sku: hit.sku,
      product_name: hit.product_name,
      unit: hit.unit || "",
      image_url: hit.image_url,
      current_cost: hit.current_cost ?? 0,
      new_cost: hit.current_cost ?? 0,
      note: ""
    };
  }

  function addProduct(hit: ProductHit) {
    setItems((prev) => [...prev, hitToDraftItem(hit)]);
    setProductQuery("");
    setProductResults([]);
  }

  function openMultiSelect() {
    setMultiSelect(true);
    setMultiSelected(new Map());
    productInputRef.current?.focus();
  }

  function toggleMultiSelected(hit: ProductHit) {
    setMultiSelected((prev) => {
      const next = new Map(prev);
      if (next.has(hit.product_id)) next.delete(hit.product_id);
      else next.set(hit.product_id, hit);
      return next;
    });
  }

  function toggleSelectAllResults() {
    setMultiSelected((prev) => {
      if (visibleProductResults.every((r) => prev.has(r.product_id))) return new Map();
      const next = new Map(prev);
      visibleProductResults.forEach((r) => next.set(r.product_id, r));
      return next;
    });
  }

  function commitMultiSelect() {
    if (multiSelected.size > 0) {
      setItems((prev) => [...prev, ...Array.from(multiSelected.values()).map(hitToDraftItem)]);
    }
    setMultiSelect(false);
    setMultiSelected(new Map());
    setProductQuery("");
    setProductResults([]);
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = tagInput.trim();
      if (v && !tags.includes(v)) setTags((p) => [...p, v]);
      setTagInput("");
    }
  }

  async function handleSubmit() {
    if (items.length === 0) {
      setError("Vui lòng thêm ít nhất một sản phẩm.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/cost-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim() || undefined,
          branch,
          staff,
          note,
          tags,
          status: "draft",
          items: items.map((it, idx) => ({
            product_id: it.product_id,
            sku: it.sku,
            product_name: it.product_name,
            unit: it.unit,
            image_url: it.image_url,
            current_cost: it.current_cost,
            new_cost: it.new_cost,
            variance: it.new_cost - it.current_cost,
            position: idx + 1,
            note: it.note
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tạo được phiếu điều chỉnh.");
      router.push(`/products/cost-adjustments/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi tạo phiếu.");
    } finally {
      setSubmitting(false);
    }
  }

  const totalVariance = useMemo(
    () => items.reduce((s, it) => s + (it.new_cost - it.current_cost), 0),
    [items]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6 bg-[#f0f1f1]">
      <header className="h-14 bg-white border-b px-6 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => router.push("/products/cost-adjustments")}
          className="flex items-center gap-2 text-[15px] text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft className="w-4 h-4" /> Tạo phiếu điều chỉnh
        </button>
        <div className="flex space-x-3">
          <button
            onClick={() => router.push("/products/cost-adjustments")}
            className="px-6 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Thoát
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 bg-[#0088ff] text-white rounded text-sm font-medium hover:bg-blue-600 shadow-sm disabled:opacity-60 flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Tạo phiếu điều chỉnh
          </button>
        </div>
      </header>

      {error ? (
        <div className="mx-6 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-8 space-y-6">
            {/* Info Card */}
            <section className="bg-white rounded shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Thông tin phiếu</h2>
              </div>
              <div className="p-4 grid grid-cols-3 gap-4">
                <div className="flex flex-col space-y-1">
                  <label className="text-xs font-medium text-gray-500">Mã phiếu</label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={codeLoading}
                    className="border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-sm py-2 bg-gray-50"
                    placeholder={codeLoading ? "Đang tải..." : "Auto"}
                  />
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-xs font-medium text-gray-500">
                    Chi nhánh <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-sm py-2 bg-gray-50"
                  >
                    <option>Chi nhánh mặc định</option>
                  </select>
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-xs font-medium text-gray-500">Người tạo</label>
                  <select
                    value={staff}
                    onChange={(e) => setStaff(e.target.value)}
                    className="border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-sm py-2 bg-gray-50"
                  >
                    <option value="">-- Chọn nhân viên --</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.full_name}>{s.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Products Card */}
            <section className="bg-white rounded shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Thông tin sản phẩm</h2>
              </div>
              <div className="p-4 flex items-center space-x-2" ref={productBoxRef}>
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    ref={productInputRef}
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Tìm theo tên, mã SKU, hoặc quét mã Barcode...(F3)"
                    className="w-full pl-10 pr-4 py-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                  {multiSelect || visibleProductResults.length > 0 ? (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded shadow-lg z-20 max-h-72 overflow-y-auto">
                      {multiSelect ? (
                        <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-gray-50 px-3 py-2">
                          <button
                            type="button"
                            onClick={toggleSelectAllResults}
                            disabled={visibleProductResults.length === 0}
                            className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-40"
                          >
                            {visibleProductResults.length > 0 &&
                            visibleProductResults.every((r) => multiSelected.has(r.product_id))
                              ? "Bỏ chọn tất cả"
                              : "Chọn tất cả"}
                          </button>
                          <button
                            type="button"
                            onClick={commitMultiSelect}
                            disabled={multiSelected.size === 0}
                            className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-40"
                          >
                            Thêm {multiSelected.size > 0 ? multiSelected.size : ""} sản phẩm
                          </button>
                        </div>
                      ) : null}
                      {productLoading ? (
                        <div className="p-3 text-sm text-gray-500 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Đang tìm…
                        </div>
                      ) : visibleProductResults.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs text-gray-500">
                          Không có sản phẩm nào để thêm.
                        </div>
                      ) : (
                        visibleProductResults.map((p) => {
                          const checked = multiSelected.has(p.product_id);
                          return (
                            <button
                              key={p.product_id}
                              type="button"
                              onClick={() => (multiSelect ? toggleMultiSelected(p) : addProduct(p))}
                              className={`w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between ${
                                checked ? "bg-blue-50" : ""
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {multiSelect ? (
                                  <input type="checkbox" checked={checked} readOnly className="pointer-events-none" />
                                ) : null}
                                {p.image_url ? (
                                  <img src={p.image_url} alt="" className="w-9 h-9 object-cover rounded border flex-shrink-0" />
                                ) : (
                                  <div className="w-9 h-9 bg-gray-100 rounded border flex items-center justify-center text-gray-300 flex-shrink-0">
                                    <Package className="w-4 h-4" />
                                  </div>
                                )}
                                <div>
                                  <div className="text-sm font-medium text-gray-800">{p.product_name}</div>
                                  <div className="text-xs text-gray-500">
                                    SKU: {p.sku || "—"} · Hiện tại: {fmtMoney.format(p.current_cost)}đ
                                  </div>
                                </div>
                              </div>
                              {!multiSelect ? <span className="text-blue-500 text-sm">+ Thêm</span> : null}
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
                <button
                  onClick={() => (multiSelect ? setMultiSelect(false) : openMultiSelect())}
                  className={`px-4 py-2 border rounded text-sm font-medium ${
                    multiSelect
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {multiSelect ? `Đang chọn (${multiSelected.size})` : "Chọn nhanh"}
                </button>
                <button className="flex items-center px-4 py-2 border border-gray-300 bg-gray-50 rounded text-sm font-medium text-gray-700 hover:bg-gray-100">
                  <span className="mr-2 opacity-60">🔳</span>
                  Barcode
                  <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              <div className="overflow-x-auto border-t">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 font-medium">
                    <tr>
                      <th className="px-6 py-3 text-left w-16">STT</th>
                      <th className="px-6 py-3 text-left w-16">Ảnh</th>
                      <th className="px-6 py-3 text-left">Tên sản phẩm</th>
                      <th className="px-6 py-3 text-right">Giá vốn hiện tại</th>
                      <th className="px-6 py-3 text-right">Chênh lệch</th>
                      <th className="px-6 py-3 text-right">Sau điều chỉnh</th>
                      <th className="px-6 py-3 text-left w-24">Ghi chú</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.length === 0 ? (
                      <tr>
                        <td className="py-20 text-center" colSpan={8}>
                          <div className="flex flex-col items-center justify-center space-y-4">
                            <div className="bg-gray-100 p-6 rounded-full">
                              <Package className="h-16 w-16 text-gray-300" />
                            </div>
                            <p className="text-gray-500">Phiếu điều chỉnh của bạn chưa có sản phẩm nào</p>
                            <button
                              onClick={openMultiSelect}
                              className="px-6 py-2 border border-blue-500 text-blue-500 rounded text-sm font-medium hover:bg-blue-50"
                            >
                              Thêm sản phẩm
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      items.map((it, idx) => {
                        const variance = it.new_cost - it.current_cost;
                        const varClass =
                          variance === 0 ? "text-slate-500" : variance > 0 ? "text-blue-600" : "text-red-600";
                        return (
                          <tr key={it.rowKey} className="hover:bg-gray-50">
                            <td className="px-6 py-3 text-slate-500">{idx + 1}</td>
                            <td className="px-6 py-3">
                              {it.image_url ? (
                                <img src={it.image_url} alt="" className="w-10 h-10 object-cover rounded border" />
                              ) : (
                                <div className="w-10 h-10 bg-gray-100 rounded border flex items-center justify-center text-gray-300">
                                  <Package className="w-5 h-5" />
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-3">
                              <div className="font-medium text-gray-800">{it.product_name}</div>
                              <div className="text-xs text-gray-500">{it.sku ? `SKU: ${it.sku}` : "—"}</div>
                            </td>
                            <td className="px-6 py-3 text-right tabular-nums text-gray-700">
                              {fmtMoney.format(it.current_cost)}
                            </td>
                            <td className={`px-6 py-3 text-right tabular-nums font-medium ${varClass}`}>
                              {variance > 0 ? "+" : ""}{fmtMoney.format(variance)}
                            </td>
                            <td className="px-6 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step={1000}
                                value={it.new_cost || ""}
                                onChange={(e) => updateItem(it.rowKey, { new_cost: parseNum(e.target.value) })}
                                className="w-32 border border-gray-300 rounded text-sm py-1 px-2 text-right"
                              />
                            </td>
                            <td className="px-6 py-3">
                              <input
                                value={it.note}
                                onChange={(e) => updateItem(it.rowKey, { note: e.target.value })}
                                className="w-full border border-gray-300 rounded text-sm py-1 px-2"
                                placeholder="Ghi chú..."
                              />
                            </td>
                            <td className="px-6 py-3">
                              <button onClick={() => removeItem(it.rowKey)} className="text-gray-400 hover:text-red-600">
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Right Column */}
          <div className="col-span-4 space-y-6">
            <section className="bg-white rounded shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Thông tin bổ sung</h2>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex flex-col space-y-1">
                  <label className="text-xs font-medium text-gray-500">Ghi chú</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-sm py-2 h-10 resize-none"
                    placeholder="VD: Điều chỉnh ngày 25/10/2022"
                  />
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-xs font-medium text-gray-500">Tags</label>
                  <div className="border border-gray-300 rounded p-2 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                          {tag}
                          <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-red-600">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      className="w-full border-none focus:ring-0 text-sm p-0"
                      placeholder="Nhập ký tự và ấn enter"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white rounded shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Tổng kết</h2>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Số sản phẩm</span>
                  <span className="font-medium">{items.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Tổng chênh lệch</span>
                  <span className={`font-bold tabular-nums ${totalVariance > 0 ? "text-blue-600" : totalVariance < 0 ? "text-red-600" : "text-gray-700"}`}>
                    {totalVariance > 0 ? "+" : ""}{fmtMoney.format(totalVariance)}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <button className="fixed bottom-6 right-6 w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-600 z-50">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>
    </div>
  );
}
