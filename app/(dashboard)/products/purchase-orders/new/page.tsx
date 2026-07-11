"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Plus,
  Settings,
  Calendar,
  Loader2,
  Trash2,
  X,
  Package
} from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";

interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  tax_code: string;
  address: string;
  city: string;
}

interface ProductHit {
  id: string;
  sku: string;
  name: string;
  status: string;
  image_url: string;
  units: string;
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
  unit_cost: number;
  discount: number;
  note: string;
}

const emptyItem = (): DraftItem => ({
  rowKey: `tmp-${Math.random().toString(36).slice(2, 9)}`,
  product_id: null,
  sku: "",
  product_name: "",
  unit: "",
  image_url: "",
  ordered_qty: 0,
  unit_cost: 0,
  discount: 0,
  note: ""
});

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function parseNumberInput(text: string): number {
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();

  const [supplierQuery, setSupplierQuery] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierDraft, setSupplierDraft] = useState({
    name: "",
    phone: "",
    email: "",
    tax_code: "",
    address: "",
    contact_name: ""
  });

  const [branch, setBranch] = useState("Chi nhánh mặc định");
  const [staff, setStaff] = useState("");
  const [staffOptions, setStaffOptions] = useState<{ id: string; full_name: string }[]>([]);
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [items, setItems] = useState<DraftItem[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [tax, setTax] = useState(0);

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
    if (!supplierQuery.trim()) {
      setSuppliers([]);
      return;
    }
    let cancelled = false;
    setSupplierLoading(true);
    fetch(`/api/purchase-orders/suppliers?q=${encodeURIComponent(supplierQuery)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setSuppliers(Array.isArray(data) ? data : []);
      })
      .catch(() => !cancelled && setSuppliers([]))
      .finally(() => !cancelled && setSupplierLoading(false));
    return () => {
      cancelled = true;
    };
  }, [supplierQuery]);

  useEffect(() => {
    if (!productQuery.trim()) {
      setProductResults([]);
      return;
    }
    let cancelled = false;
    setProductLoading(true);
    fetch(`/api/purchase-orders/products-search?q=${encodeURIComponent(productQuery)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setProductResults(Array.isArray(data) ? data : []);
      })
      .catch(() => !cancelled && setProductResults([]))
      .finally(() => !cancelled && setProductLoading(false));
    return () => {
      cancelled = true;
    };
  }, [productQuery]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (productBoxRef.current && !productBoxRef.current.contains(event.target as Node)) {
        setProductResults([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + it.ordered_qty * it.unit_cost, 0),
    [items]
  );
  const itemDiscount = useMemo(() => items.reduce((sum, it) => sum + it.discount, 0), [items]);
  const finalTotal = Math.max(subtotal - globalDiscount + tax, 0);
  const totalQty = items.reduce((s, it) => s + it.ordered_qty, 0);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.rowKey === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.rowKey !== key));
  }

  function addProductToOrder(product: ProductHit) {
    const draft: DraftItem = {
      ...emptyItem(),
      product_id: product.id,
      sku: product.sku,
      product_name: product.name,
      unit: product.units || "",
      image_url: product.image_url,
      ordered_qty: 1,
      unit_cost: product.default_cost ?? 0,
      note: ""
    };
    setItems((prev) => [...prev, draft]);
    setProductQuery("");
    setProductResults([]);
  }

  function handleAddTag() {
    const value = tagInput.trim();
    if (!value) return;
    if (!tags.includes(value)) setTags((prev) => [...prev, value]);
    setTagInput("");
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  }

  async function handleCreateSupplier() {
    if (!supplierDraft.name.trim()) {
      setError("Vui lòng nhập tên nhà cung cấp.");
      return;
    }
    setError("");
    try {
      const res = await fetch("/api/purchase-orders/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierDraft)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tạo được nhà cung cấp.");
      setSupplier(data);
      setSupplierQuery(data.name);
      setShowSupplierForm(false);
      setNotice(`Đã thêm nhà cung cấp ${data.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi tạo nhà cung cấp.");
    }
  }

  async function handleSubmit() {
    if (!supplier) {
      setError("Vui lòng chọn nhà cung cấp trước khi tạo đơn.");
      return;
    }
    if (items.length === 0) {
      setError("Vui lòng thêm ít nhất một sản phẩm vào đơn.");
      return;
    }
    const validItems = items.filter((it) => it.product_name || it.sku);
    if (validItems.length === 0) {
      setError("Chưa có sản phẩm hợp lệ trong đơn.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          supplier_phone: supplier.phone,
          branch,
          staff,
          expected_date: expectedDate || null,
          note,
          tags,
          status: "pending",
          discount: globalDiscount,
          tax,
          items: validItems.map((it, idx) => ({
            product_id: it.product_id,
            sku: it.sku,
            product_name: it.product_name,
            unit: it.unit,
            image_url: it.image_url,
            ordered_qty: it.ordered_qty,
            received_qty: 0,
            unit_cost: it.unit_cost,
            discount: it.discount,
            line_total: Math.max(it.ordered_qty * it.unit_cost - it.discount, 0),
            position: idx + 1,
            note: it.note
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tạo được đơn đặt hàng.");
      setNotice(`Đã tạo đơn đặt hàng ${data.code}.`);
      router.push(`/products/purchase-orders/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi tạo đơn đặt hàng.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6 bg-slate-100">
      <header className="h-14 bg-white border-b px-6 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => router.push("/products/purchase-orders")}
          className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách đơn đặt hàng
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/products/purchase-orders")}
            className="px-6 py-2 border border-slate-300 rounded text-slate-700 bg-white hover:bg-slate-50 text-sm font-medium"
          >
            Thoát
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium disabled:opacity-60 flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Tạo đơn đặt hàng
          </button>
        </div>
      </header>

      {error ? (
        <div className="mx-6 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mx-6 mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-white rounded shadow-sm p-5">
            <h2 className="text-base font-semibold mb-4 text-slate-800">Thông tin nhà cung cấp</h2>

            {!supplier ? (
              <>
                <div className="relative mb-6">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                    <Search className="w-5 h-5" />
                  </span>
                  <input
                    value={supplierQuery}
                    onChange={(e) => {
                      setSupplierQuery(e.target.value);
                      setShowSupplierForm(false);
                    }}
                    placeholder="Tìm theo tên, SĐT, mã nhà cung cấp... (F4)"
                    className="w-full pl-10 pr-4 py-2 border-slate-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                  {supplierLoading ? (
                    <span className="absolute right-3 inset-y-0 flex items-center text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </span>
                  ) : null}
                </div>

                {supplierQuery.trim() ? (
                  <div className="border rounded divide-y mb-3 max-h-60 overflow-y-auto">
                    {suppliers.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500">
                        Không tìm thấy.{" "}
                        <button
                          className="text-blue-600 hover:underline"
                          onClick={() => {
                            setSupplierDraft({ ...supplierDraft, name: supplierQuery });
                            setShowSupplierForm(true);
                          }}
                        >
                          + Tạo nhà cung cấp mới
                        </button>
                      </div>
                    ) : (
                      suppliers.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSupplier(s);
                            setSupplierQuery(s.name);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
                        >
                          <div>
                            <div className="text-sm font-medium text-slate-800">{s.name}</div>
                            <div className="text-xs text-slate-500">
                              {s.phone || "—"} {s.code ? `· Mã: ${s.code}` : ""}
                            </div>
                          </div>
                          <Plus className="w-4 h-4 text-slate-400" />
                        </button>
                      ))
                    )}
                  </div>
                ) : null}

                {showSupplierForm ? (
                  <div className="border rounded p-4 bg-slate-50 space-y-3">
                    <div className="text-sm font-medium text-slate-700">
                      Tạo nhà cung cấp mới
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        value={supplierDraft.name}
                        onChange={(e) =>
                          setSupplierDraft({ ...supplierDraft, name: e.target.value })
                        }
                        placeholder="Tên nhà cung cấp *"
                        className="border-slate-300 rounded text-sm py-2 px-3"
                      />
                      <input
                        value={supplierDraft.contact_name}
                        onChange={(e) =>
                          setSupplierDraft({
                            ...supplierDraft,
                            contact_name: e.target.value
                          })
                        }
                        placeholder="Người liên hệ"
                        className="border-slate-300 rounded text-sm py-2 px-3"
                      />
                      <input
                        value={supplierDraft.phone}
                        onChange={(e) =>
                          setSupplierDraft({ ...supplierDraft, phone: e.target.value })
                        }
                        placeholder="Số điện thoại"
                        className="border-slate-300 rounded text-sm py-2 px-3"
                      />
                      <input
                        value={supplierDraft.email}
                        onChange={(e) =>
                          setSupplierDraft({ ...supplierDraft, email: e.target.value })
                        }
                        placeholder="Email"
                        className="border-slate-300 rounded text-sm py-2 px-3"
                      />
                      <input
                        value={supplierDraft.tax_code}
                        onChange={(e) =>
                          setSupplierDraft({ ...supplierDraft, tax_code: e.target.value })
                        }
                        placeholder="Mã số thuế"
                        className="border-slate-300 rounded text-sm py-2 px-3"
                      />
                      <input
                        value={supplierDraft.address}
                        onChange={(e) =>
                          setSupplierDraft({ ...supplierDraft, address: e.target.value })
                        }
                        placeholder="Địa chỉ"
                        className="border-slate-300 rounded text-sm py-2 px-3"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowSupplierForm(false)}
                        className="px-4 py-1.5 border border-slate-300 rounded text-sm hover:bg-slate-100"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={handleCreateSupplier}
                        className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                      >
                        Lưu nhà cung cấp
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <Package className="w-16 h-16 mb-2 opacity-20" />
                  <p className="text-sm">Chưa có thông tin nhà cung cấp</p>
                </div>
              </>
            ) : (
              <div className="border rounded p-4 bg-slate-50">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-base font-semibold text-slate-800">{supplier.name}</div>
                    <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                      {supplier.contact_name ? <div>Người liên hệ: {supplier.contact_name}</div> : null}
                      {supplier.phone ? <div>SĐT: {supplier.phone}</div> : null}
                      {supplier.email ? <div>Email: {supplier.email}</div> : null}
                      {supplier.tax_code ? <div>MST: {supplier.tax_code}</div> : null}
                      {supplier.address ? <div>Địa chỉ: {supplier.address}</div> : null}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSupplier(null);
                      setSupplierQuery("");
                    }}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded shadow-sm p-5">
            <h2 className="text-base font-semibold mb-4 text-slate-800">Thông tin đơn đặt hàng</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Chi nhánh</label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full border-slate-300 rounded text-sm bg-slate-50 py-2 px-3"
                >
                  <option>Chi nhánh mặc định</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Nhân viên</label>
                <select
                  value={staff}
                  onChange={(e) => setStaff(e.target.value)}
                  className="w-full border-slate-300 rounded text-sm bg-slate-50 py-2 px-3"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.full_name}>{s.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Ngày nhập</label>
                <div className="relative">
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="w-full pr-10 border-slate-300 rounded text-sm bg-slate-50 py-2 px-3"
                  />
                  <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400">
                    <Calendar className="w-5 h-5" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded shadow-sm">
          <div className="p-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">Thông tin sản phẩm</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input id="split-lines" type="checkbox" className="rounded text-blue-600" />
                <label htmlFor="split-lines" className="text-sm text-slate-600">
                  Tách dòng
                </label>
              </div>
              <button className="text-slate-400 hover:text-slate-600">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="flex gap-0 border rounded overflow-hidden mb-4" ref={productBoxRef}>
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  <Search className="w-5 h-5" />
                </span>
                <input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Tìm theo tên, mã SKU, hoặc quét mã Barcode... (F3)"
                  className="w-full pl-10 pr-4 py-2 border-none focus:ring-0 text-sm"
                />
                {productResults.length > 0 ? (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded shadow-lg z-20 max-h-72 overflow-y-auto">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addProductToOrder(p)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {p.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            SKU: {p.sku || "—"}
                            {p.units ? ` · ${p.units}` : ""}
                          </div>
                        </div>
                        <span className="text-xs text-blue-600 whitespace-nowrap">
                          {formatCurrencyVND(p.default_cost)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : productLoading ? (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded shadow-lg z-20 p-3 text-sm text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Đang tìm…
                  </div>
                ) : null}
              </div>
              <button className="px-4 py-2 border-l bg-slate-50 text-sm text-slate-700 font-medium hover:bg-slate-100">
                Chọn nhanh
              </button>
              <div className="border-l bg-slate-50">
                <select className="border-none bg-transparent py-2 pl-3 pr-8 text-sm focus:ring-0 text-slate-700">
                  <option>Giá nhập</option>
                  <option>Giá bán</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase py-3 border-b border-t bg-slate-50/50">
              <div className="col-span-1 text-center">STT</div>
              <div className="col-span-1 text-center">Ảnh</div>
              <div className="col-span-4">Tên sản phẩm</div>
              <div className="col-span-1 text-center">Đơn vị</div>
              <div className="col-span-1 text-center">SL đặt</div>
              <div className="col-span-1 text-right">Đơn giá</div>
              <div className="col-span-1 text-right">Chiết khấu</div>
              <div className="col-span-2 text-right">Thành tiền</div>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 border-b">
                <div className="w-20 h-20 mb-4 opacity-20 flex items-center justify-center">
                  <svg fill="currentColor" viewBox="0 0 24 24" className="w-full h-full">
                    <path d="M22 3.41L16.71 8.7a2 2 0 0 1-2.82 0l-.29-.3a2 2 0 0 1 0-2.82L18.89 1l3.11 2.41zM14 16h8v2h-8v-2zm0-4h8v2h-8v-2zM4 9h10V7H4v2zm0 4h10v-2H4v2zm0 4h7v-2H4v2zm16-4h2v8h-2v-8zM2 4h15v2H2V4z" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500 mb-6">
                  Đơn đặt hàng nhập của bạn chưa có sản phẩm nào
                </p>
                <button
                  onClick={() => setProductQuery("")}
                  className="px-6 py-2 border-2 border-blue-400 text-blue-500 rounded font-medium text-sm hover:bg-blue-50"
                >
                  Thêm sản phẩm
                </button>
              </div>
            ) : (
              <div className="divide-y">
                {items.map((it, idx) => {
                  const lineTotal = Math.max(it.ordered_qty * it.unit_cost - it.discount, 0);
                  return (
                    <div key={it.rowKey} className="grid grid-cols-12 gap-2 py-3 items-center text-sm">
                      <div className="col-span-1 text-center text-slate-500">{idx + 1}</div>
                      <div className="col-span-1 flex justify-center">
                        {it.image_url ? (
                          <img
                            src={it.image_url}
                            alt=""
                            className="w-10 h-10 object-cover rounded border"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-slate-300">
                            <Package className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                      <div className="col-span-4">
                        <div className="font-medium text-slate-800">
                          {it.product_name || "(Chưa đặt tên)"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {it.sku ? `SKU: ${it.sku}` : "—"}
                        </div>
                      </div>
                      <div className="col-span-1 text-center text-slate-600">{it.unit || "—"}</div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={it.ordered_qty || ""}
                          onChange={(e) =>
                            updateItem(it.rowKey, { ordered_qty: parseNumberInput(e.target.value) })
                          }
                          className="w-full border-slate-300 rounded text-sm text-right py-1 px-2"
                        />
                      </div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={it.unit_cost || ""}
                          onChange={(e) =>
                            updateItem(it.rowKey, { unit_cost: parseNumberInput(e.target.value) })
                          }
                          className="w-full border-slate-300 rounded text-sm text-right py-1 px-2"
                        />
                      </div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={it.discount || ""}
                          onChange={(e) =>
                            updateItem(it.rowKey, { discount: parseNumberInput(e.target.value) })
                          }
                          className="w-full border-slate-300 rounded text-sm text-right py-1 px-2"
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-2">
                        <span className="font-medium text-slate-800 tabular-nums">
                          {formatCurrencyVND(lineTotal)}
                        </span>
                        <button
                          onClick={() => removeItem(it.rowKey)}
                          className="text-slate-400 hover:text-red-600"
                          title="Xóa dòng"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-8 mt-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Ghi chú đơn</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full border-slate-300 rounded text-sm p-3 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="VD: Hàng tặng gói riêng"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Tags</label>
                  <div className="border-slate-300 border rounded p-3 min-h-[100px] space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs"
                        >
                          {tag}
                          <button
                            onClick={() => setTags(tags.filter((t) => t !== tag))}
                            className="hover:text-red-600"
                          >
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
              <div className="space-y-3 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Số lượng</span>
                  <span className="font-medium tabular-nums">{formatNumber(totalQty)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tổng tiền</span>
                  <span className="font-medium tabular-nums">{formatCurrencyVND(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-blue-500">Chiết khấu (F6)</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={globalDiscount || ""}
                    onChange={(e) => setGlobalDiscount(parseNumberInput(e.target.value))}
                    className="w-32 border-slate-300 rounded text-sm text-right py-1 px-2"
                    placeholder="0"
                  />
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-500">Thuế</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={tax || ""}
                    onChange={(e) => setTax(parseNumberInput(e.target.value))}
                    className="w-32 border-slate-300 rounded text-sm text-right py-1 px-2"
                    placeholder="0"
                  />
                </div>
                <div className="flex justify-between text-base font-bold pt-4 border-t border-dashed">
                  <span className="text-slate-800">Tiền cần trả</span>
                  <span className="text-slate-800 tabular-nums">{formatCurrencyVND(finalTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button className="fixed bottom-6 right-6 w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-600 z-50">
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />
        </svg>
      </button>
    </div>
  );
}
