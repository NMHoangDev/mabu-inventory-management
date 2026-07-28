"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Plus,
  Loader2,
  Package,
  X,
  Download
} from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";
import { PageGuard } from "@/components/auth/PageGuard";

interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  tax_code: string;
  address: string;
}

interface ProductHit {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  default_cost: number;
}

interface DraftItem {
  rowKey: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  ordered_qty: number;
  received_qty: number;
  unit_cost: number;
  discount: number;
  note: string;
}

type SubmitAction = "pending" | "completed";

const emptyItem = (): DraftItem => ({
  rowKey: `tmp-${Math.random().toString(36).slice(2, 9)}`,
  product_id: null,
  sku: "",
  product_name: "",
  unit: "",
  image_url: "",
  ordered_qty: 0,
  received_qty: 0,
  unit_cost: 0,
  discount: 0,
  note: ""
});

function parseNum(text: string): number {
  const cleaned = text.replace(/[^0-9.-]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
}

export default function NewGoodsReceiptPage() {
  const router = useRouter();

  const [code, setCode] = useState("PON00001");
  const [codeLoading, setCodeLoading] = useState(true);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [branch, setBranch] = useState("Chi nhánh mặc định");
  const [staff, setStaff] = useState("");
  const [staffOptions, setStaffOptions] = useState<{ id: string; full_name: string }[]>([]);
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [paid, setPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const [items, setItems] = useState<DraftItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductHit[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const productBoxRef = useRef<HTMLDivElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/staff")
      .then((r) => r.json())
      .then((d) => setStaffOptions(Array.isArray(d?.staff) ? d.staff : []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCodeLoading(true);
    fetch("/api/goods-receipts/next-code")
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.code) setCode(d.code); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setCodeLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!supplierQuery.trim()) { setSuppliers([]); return; }
    let cancelled = false;
    setSupplierLoading(true);
    fetch(`/api/purchase-orders/suppliers?q=${encodeURIComponent(supplierQuery)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setSuppliers(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setSuppliers([]); })
      .finally(() => { if (!cancelled) setSupplierLoading(false); });
    return () => { cancelled = true; };
  }, [supplierQuery]);

  useEffect(() => {
    if (!productQuery.trim()) { setProductResults([]); return; }
    let cancelled = false;
    setProductLoading(true);
    fetch(`/api/goods-receipts/products-search?q=${encodeURIComponent(productQuery)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setProductResults(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setProductResults([]); })
      .finally(() => { if (!cancelled) setProductLoading(false); });
    return () => { cancelled = true; };
  }, [productQuery]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (productBoxRef.current && !productBoxRef.current.contains(e.target as Node)) {
        setProductResults([]);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + Math.max(it.received_qty * it.unit_cost - it.discount, 0), 0),
    [items]
  );
  const totalQty = useMemo(() => items.reduce((s, it) => s + it.received_qty, 0), [items]);
  const finalTotal = Math.max(subtotal - globalDiscount + tax, 0);
  const remaining = Math.max(finalTotal - paid, 0);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((p) => p.map((it) => it.rowKey === key ? { ...it, ...patch } : it));
  }

  function removeItem(key: string) {
    setItems((p) => p.filter((it) => it.rowKey !== key));
  }

  function addProductToReceipt(hit: ProductHit) {
    setItems((prev) => [
      ...prev,
      {
        ...emptyItem(),
        product_id: hit.product_id,
        sku: hit.sku,
        product_name: hit.product_name,
        unit: hit.unit || "",
        image_url: hit.image_url,
        ordered_qty: 0,
        received_qty: 1,
        unit_cost: hit.default_cost ?? 0
      }
    ]);
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

  async function handleSubmit(action: SubmitAction) {
    if (!supplier) {
      setError("Vui lòng chọn nhà cung cấp trước.");
      return;
    }
    const validItems = items.filter((it) => it.product_name || it.sku);
    if (validItems.length === 0) {
      setError("Vui lòng thêm ít nhất một sản phẩm.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/goods-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim() || undefined,
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          supplier_phone: supplier.phone,
          branch,
          staff,
          expected_date: expectedDate || null,
          note,
          tags,
          receipt_status: action === "completed" ? "completed" : "pending",
          order_status: action === "completed" ? "completed" : "pending",
          discount: globalDiscount,
          tax,
          paid,
          payment_method: paymentMethod,
          items: validItems.map((it, idx) => ({
            product_id: it.product_id,
            sku: it.sku,
            product_name: it.product_name,
            unit: it.unit,
            image_url: it.image_url,
            ordered_qty: it.ordered_qty,
            received_qty: it.received_qty,
            unit_cost: it.unit_cost,
            discount: it.discount,
            line_total: Math.max(it.received_qty * it.unit_cost - it.discount, 0),
            position: idx + 1,
            note: it.note
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tạo được đơn nhập hàng.");
      setNotice(`Đã tạo đơn nhập hàng ${data.code}.`);
      router.push(`/products/goods-receipts/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi tạo đơn nhập hàng.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageGuard permission="goods_receipts.create">
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6 bg-[#f0f2f5]">
      <header className="h-14 bg-white border-b px-6 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => router.push("/products/goods-receipts")}
          className="flex items-center gap-2 text-[15px] text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách đơn nhập hàng
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/products/goods-receipts")}
            className="px-5 py-2 border border-blue-500 text-blue-500 rounded text-sm font-medium hover:bg-blue-50"
          >
            Thoát
          </button>
          <button
            onClick={() => handleSubmit("pending")}
            disabled={submitting}
            className="px-5 py-2 border border-blue-500 text-blue-500 rounded text-sm font-medium hover:bg-blue-50 disabled:opacity-60 flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Tạo &amp; chưa nhập
          </button>
          <div className="inline-flex rounded shadow-sm">
            <button
              onClick={() => handleSubmit("completed")}
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 text-white rounded-l border-r border-blue-700 hover:bg-blue-700 text-sm font-medium disabled:opacity-60 flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Tạo &amp; nhập hàng
            </button>
            <button className="px-2 py-2 bg-blue-600 text-white rounded-r hover:bg-blue-700">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-6 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="mx-6 mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}</div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-12 gap-6">
            {/* Left Column */}
            <div className="col-span-8 space-y-6">
              {/* Supplier Info */}
              <div className="bg-white rounded shadow-sm p-5">
                <h2 className="font-semibold mb-4">Thông tin nhà cung cấp</h2>
                {!supplier ? (
                  <>
                    <div className="relative mb-3">
                      <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                        <Search className="w-4 h-4" />
                      </span>
                      <input
                        value={supplierQuery}
                        onChange={(e) => { setSupplierQuery(e.target.value); setSupplier(null); }}
                        placeholder="Tìm theo tên, SĐT, mã nhà cung cấp... (F4)"
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                      />
                      {supplierLoading ? (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </span>
                      ) : null}
                    </div>
                    {supplierQuery.trim() && suppliers.length > 0 ? (
                      <div className="border rounded divide-y max-h-60 overflow-y-auto mb-3">
                        {suppliers.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => { setSupplier(s); setSupplierQuery(s.name); setSuppliers([]); }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
                          >
                            <div>
                              <div className="text-sm font-medium text-slate-800">{s.name}</div>
                              <div className="text-xs text-slate-500">{s.phone || "—"} · {s.code || "Chưa có mã"}</div>
                            </div>
                            <Plus className="w-4 h-4 text-slate-400" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-col items-center justify-center py-10 opacity-40">
                      <svg className="w-16 h-16 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V10z" />
                      </svg>
                      <p className="text-sm text-slate-500">Chưa có thông tin nhà cung cấp</p>
                    </div>
                  </>
                ) : (
                  <div className="border rounded p-4 bg-slate-50 flex items-start justify-between">
                    <div>
                      <div className="text-base font-semibold text-slate-800">{supplier.name}</div>
                      <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                        {supplier.contact_name ? <div>Người liên hệ: {supplier.contact_name}</div> : null}
                        {supplier.phone ? <div>SĐT: {supplier.phone}</div> : null}
                        {supplier.tax_code ? <div>MST: {supplier.tax_code}</div> : null}
                        {supplier.address ? <div>Địa chỉ: {supplier.address}</div> : null}
                      </div>
                    </div>
                    <button onClick={() => { setSupplier(null); setSupplierQuery(""); }} className="text-slate-400 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Products */}
              <div className="bg-white rounded shadow-sm">
                <div className="p-5 pb-0">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold">Thông tin sản phẩm</h2>
                    <div className="flex items-center gap-4 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded text-blue-500" />
                        <span>Tách dòng</span>
                      </label>
                      <button className="text-slate-400 hover:text-slate-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 mb-5">
                    <div className="relative flex-1" ref={productBoxRef}>
                      <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                        <Search className="w-4 h-4" />
                      </span>
                      <input
                        value={productQuery}
                        onChange={(e) => setProductQuery(e.target.value)}
                        placeholder="Tìm theo tên, mã SKU, hoặc quét mã Barcode...(F3)"
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-l focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                      />
                      {productResults.length > 0 ? (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded shadow-lg z-20 max-h-60 overflow-y-auto">
                          {productResults.map((p) => (
                            <button
                              key={p.product_id}
                              onClick={() => addProductToReceipt(p)}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
                            >
                              <div>
                                <div className="text-sm font-medium text-slate-800">{p.product_name}</div>
                                <div className="text-xs text-slate-500">SKU: {p.sku || "—"} · {formatCurrencyVND(p.default_cost)}</div>
                              </div>
                              <Plus className="w-4 h-4 text-slate-400" />
                            </button>
                          ))}
                        </div>
                      ) : productLoading ? (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded shadow-lg z-20 p-3 text-sm text-slate-500 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Đang tìm…
                        </div>
                      ) : null}
                    </div>
                    <button className="px-4 py-2 border border-slate-300 border-l-0 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm">
                      Chọn nhiều
                    </button>
                    <button className="px-3 py-2 border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center gap-1 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6-11h2m-2-7h8M5 3h12a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
                      </svg>
                      <span className="text-xs">(F10)</span>
                    </button>
                    <select className="border border-slate-300 rounded px-3 py-2 bg-slate-50 text-sm text-slate-600">
                      <option>Giá nhập</option>
                    </select>
                  </div>
                </div>

                {/* Table */}
                <div className="border-t border-slate-100">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">STT</th>
                        <th className="px-4 py-3">Ảnh</th>
                        <th className="px-4 py-3">Tên sản phẩm</th>
                        <th className="px-4 py-3">Đơn vị</th>
                        <th className="px-4 py-3">SL nhập</th>
                        <th className="px-4 py-3">Đơn giá</th>
                        <th className="px-4 py-3">Chiết khấu</th>
                        <th className="px-4 py-3 text-right">Thành tiền</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                  </table>
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="bg-slate-100 rounded-lg p-6 mb-4">
                        <Package className="w-12 h-12 text-slate-300" />
                      </div>
                      <p className="text-slate-400 mb-4">Đơn hàng nhập của bạn chưa có sản phẩm nào</p>
                      <button
                        onClick={() => setProductQuery("")}
                        className="px-6 py-2 border border-blue-500 text-blue-500 rounded hover:bg-blue-50 font-medium text-sm"
                      >
                        Thêm sản phẩm
                      </button>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <tbody className="divide-y">
                        {items.map((it, idx) => {
                          const lineTotal = Math.max(it.received_qty * it.unit_cost - it.discount, 0);
                          return (
                            <tr key={it.rowKey} className="hover:bg-slate-50">
                              <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                              <td className="px-4 py-3">
                                {it.image_url ? (
                                  <img src={it.image_url} alt="" className="w-10 h-10 object-cover rounded border" />
                                ) : (
                                  <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-slate-300">
                                    <Package className="w-5 h-5" />
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-800">{it.product_name}</div>
                                <div className="text-xs text-slate-500">{it.sku ? `SKU: ${it.sku}` : "—"}</div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{it.unit || "—"}</td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={it.received_qty || ""}
                                  onChange={(e) => updateItem(it.rowKey, { received_qty: parseNum(e.target.value) })}
                                  className="w-20 border border-slate-300 rounded text-sm py-1 px-2"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min={0}
                                  step={1000}
                                  value={it.unit_cost || ""}
                                  onChange={(e) => updateItem(it.rowKey, { unit_cost: parseNum(e.target.value) })}
                                  className="w-28 border border-slate-300 rounded text-sm py-1 px-2"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min={0}
                                  step={1000}
                                  value={it.discount || ""}
                                  onChange={(e) => updateItem(it.rowKey, { discount: parseNum(e.target.value) })}
                                  className="w-24 border border-slate-300 rounded text-sm py-1 px-2"
                                />
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-800 tabular-nums">
                                {formatCurrencyVND(lineTotal)}
                              </td>
                              <td className="px-4 py-3">
                                <button onClick={() => removeItem(it.rowKey)} className="text-slate-400 hover:text-red-600">
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Notes & Tags */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white rounded shadow-sm p-5">
                  <label className="block text-sm font-medium text-slate-600 mb-2">Ghi chú đơn</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full border border-slate-300 rounded p-2 h-24 focus:ring-1 focus:ring-blue-500 outline-none resize-none text-sm"
                    placeholder="VD: Hàng tặng gói riêng"
                  />
                </div>
                <div className="bg-white rounded shadow-sm p-5">
                  <label className="block text-sm font-medium text-slate-600 mb-2">Tags</label>
                  <div className="border border-slate-300 rounded p-2 h-24 space-y-2">
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
            </div>

            {/* Right Column */}
            <div className="col-span-4 space-y-6">
              {/* Order Info */}
              <div className="bg-white rounded shadow-sm p-5">
                <h2 className="font-semibold mb-4">Thông tin đơn nhập hàng</h2>
                <div className="space-y-4 text-sm">
                  <div>
                    <label className="block text-slate-500 text-xs mb-1">Chi nhánh</label>
                    <select
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-2 bg-white text-sm"
                    >
                      <option>Chi nhánh mặc định</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 text-xs mb-1">Nhân viên</label>
                    <select
                      value={staff}
                      onChange={(e) => setStaff(e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-2 bg-white text-sm"
                    >
                      <option value="">-- Chọn nhân viên --</option>
                      {staffOptions.map((s) => (
                        <option key={s.id} value={s.full_name}>{s.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 text-xs mb-1">Ngày hẹn giao</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={expectedDate}
                        onChange={(e) => setExpectedDate(e.target.value)}
                        className="w-full border border-slate-300 rounded px-3 py-2 bg-white text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="bg-white rounded shadow-sm p-5">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Số lượng</span>
                    <span className="font-medium tabular-nums">{totalQty}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tổng tiền</span>
                    <span className="font-medium tabular-nums">{formatCurrencyVND(subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-blue-500 cursor-pointer">Chiết khấu (F6)</span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={globalDiscount || ""}
                      onChange={(e) => setGlobalDiscount(parseNum(e.target.value))}
                      className="w-32 border border-slate-300 rounded text-sm py-1 px-2 text-right"
                      placeholder="0"
                    />
                  </div>
                  <div className="pt-2">
                    <span className="text-slate-700 font-medium">Chi phí nhập hàng</span>
                  </div>
                  <button className="flex items-center gap-2 text-blue-500 cursor-pointer text-xs">
                    <Plus className="w-3 h-3" /> Thêm chi phí (F7)
                  </button>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">Thuế</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={tax || ""}
                      onChange={(e) => setTax(parseNum(e.target.value))}
                      className="w-32 border border-slate-300 rounded text-sm py-1 px-2 text-right"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex justify-between items-center py-2 border-t border-slate-100">
                    <span className="font-bold">Tiền cần trả</span>
                    <span className="font-bold tabular-nums">{formatCurrencyVND(finalTotal)}</span>
                  </div>
                  <div className="pt-2">
                    <span className="text-slate-700 font-medium">Thanh toán cho NCC</span>
                  </div>
                  <button className="flex items-center gap-2 text-blue-500 cursor-pointer text-xs">
                    <Plus className="w-3 h-3" /> Thêm phương thức
                  </button>
                  <div className="flex items-center gap-3">
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
                    >
                      <option value="cash">Tiền mặt</option>
                      <option value="bank_transfer">Chuyển khoản</option>
                      <option value="card">Thẻ</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={paid || ""}
                      onChange={(e) => setPaid(parseNum(e.target.value))}
                      className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-sm text-right"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex justify-between items-center py-3 border-t border-slate-100 mt-2">
                    <span className="text-slate-600">Còn phải trả</span>
                    <span className="font-bold text-lg tabular-nums text-slate-800">{formatCurrencyVND(remaining)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button className="fixed bottom-6 right-6 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-700 z-50">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    </div>
    </PageGuard>
  );
}
