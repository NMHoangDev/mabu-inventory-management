"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  UserPlus,
  QrCode,
  Plus,
  Minus,
  Trash2,
  Settings,
  Megaphone,
  Pencil,
  Wallet,
  Banknote,
  CreditCard,
  Printer,
  ReceiptText,
  Info,
  ShoppingCart,
  StickyNote,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
  price: number;
  image_url: string;
}

interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
}

interface CartItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  unit: string;
  image_url: string;
  unit_price: number;
  quantity: number;
}

const SOURCES = [
  { v: "store", l: "Tại cửa hàng" },
  { v: "facebook", l: "Facebook" },
  { v: "website", l: "Website" },
  { v: "zalo", l: "Zalo" },
];
const BRANCHES = ["Chi nhánh chính", "Chi nhánh trung tâm", "Kho Quận 1"];
const STAFF = "Nguyễn Văn A";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function NewOrderPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [source, setSource] = useState("store");
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [orderDate, setOrderDate] = useState(fmtDate(new Date()));
  const [orderTime, setOrderTime] = useState(fmtTime(new Date()));
  const [note, setNote] = useState("");

  const [discount, setDiscount] = useState(0);
  const [shippingFee, setShippingFee] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "card">("cash");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Customer search
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orders/search-customers?q=${encodeURIComponent(customerSearch)}&limit=8`);
        const data = await res.json();
        setCustomerResults(data.customers ?? []);
      } catch (e) { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [customerSearch]);

  // Product search
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orders/search-products?q=${encodeURIComponent(productSearch)}&limit=8`);
        const data = await res.json();
        setProductResults(data.products ?? []);
      } catch (e) { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [productSearch]);

  const productInputRef = useRef<HTMLInputElement>(null);

  const addProduct = (p: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === p.id);
      if (existing) {
        return prev.map((c) => c.product_id === p.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          product_sku: p.sku,
          unit: p.unit,
          image_url: p.image_url,
          unit_price: p.price,
          quantity: 1,
        },
      ];
    });
    setProductSearch("");
    setShowProductDropdown(false);
    setTimeout(() => productInputRef.current?.focus(), 0);
  };

  const updateQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.product_id !== productId));
      return;
    }
    setCart((prev) => prev.map((c) => c.product_id === productId ? { ...c, quantity: qty } : c));
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  };

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.quantity * c.unit_price, 0), [cart]);
  const total = useMemo(() => Math.max(0, subtotal - discount + shippingFee), [subtotal, discount, shippingFee]);

  const submit = async (status: "new" | "completed") => {
    if (cart.length === 0) {
      setError("Đơn hàng phải có ít nhất 1 sản phẩm.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const paid = status === "completed" ? total : 0;
      const payload = {
        customer_id: customer?.id ?? null,
        customer_name: customer?.name ?? "Khách lẻ",
        customer_phone: customer?.phone ?? "",
        source,
        branch,
        staff: STAFF,
        note,
        discount,
        shipping_fee: shippingFee,
        paid,
        payment_status: paid >= total && total > 0 ? "paid" : "unpaid",
        fulfillment_status: "unshipped",
        status,
        items: cart.map((c) => ({
          product_id: c.product_id,
          product_name: c.product_name,
          product_sku: c.product_sku,
          unit: c.unit,
          image_url: c.image_url,
          quantity: c.quantity,
          unit_price: c.unit_price,
        })),
      };
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Lưu đơn thất bại.");
      }
      const order = await res.json();
      router.push(`/orders/${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-[#f4f6f8] overflow-hidden">
      {/* Top app bar */}
      <header className="h-14 bg-white border-b border-[#c0c6d6] flex justify-between items-center px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/orders" className="flex items-center text-[#005baf] hover:bg-[#ebf5ff] p-2 rounded transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h2 className="text-lg font-bold text-[#0d1d29]">Tạo đơn hàng</h2>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 hover:bg-[#ebf5ff] rounded-full transition-colors">
            <ReceiptText className="w-5 h-5 text-[#404754]" />
          </button>
          <button className="p-2 hover:bg-[#ebf5ff] rounded-full transition-colors">
            <Info className="w-5 h-5 text-[#404754]" />
          </button>
          <div className="flex items-center gap-2 pl-3 border-l border-[#c0c6d6]">
            <span className="text-xs text-[#0d1d29] font-medium">{STAFF}</span>
            <div className="w-8 h-8 rounded-full bg-[#0074db] flex items-center justify-center text-white font-bold text-xs">A</div>
          </div>
        </div>
      </header>

      {/* Main workspace */}
      <main className="flex-1 flex gap-4 p-6 overflow-hidden">
        {/* Left column */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Customer search */}
          <section className="bg-white border border-[#c0c6d6] rounded p-4 relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#404754]" />
              <input
                value={customer ? customer.name : customerSearch}
                onChange={(e) => {
                  setCustomer(null);
                  setCustomerSearch(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                placeholder="Tìm kiếm khách hàng (F4)"
                className="w-full pl-10 pr-10 py-2 border border-[#717785] rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none transition-all"
              />
              {!customer && (
                <Link href="/customers" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#005baf] hover:bg-[#ebf5ff] p-1 rounded">
                  <UserPlus className="w-5 h-5" />
                </Link>
              )}
            </div>
            {showCustomerDropdown && !customer && customerResults.length > 0 && (
              <div className="absolute z-20 left-4 right-4 top-full mt-1 bg-white border border-[#c0c6d6] rounded shadow-lg max-h-60 overflow-auto">
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCustomer(c);
                      setShowCustomerDropdown(false);
                      setCustomerSearch("");
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[#ebf5ff] flex flex-col border-b last:border-0 border-[#c0c6d6]"
                  >
                    <span className="text-sm font-medium text-[#0d1d29]">{c.name}</span>
                    <span className="text-xs text-[#404754]">{c.phone || c.code || c.email || "—"}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Product search + cart */}
          <section className="bg-white border border-[#c0c6d6] rounded flex-1 flex flex-col min-h-0">
            <div className="p-4 border-b border-[#c0c6d6]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#404754]" />
                <input
                  ref={productInputRef}
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                  onFocus={() => setShowProductDropdown(true)}
                  placeholder="Tìm theo tên, mã SKU, barcode (F2)"
                  className="w-full pl-10 pr-10 py-2 border border-[#717785] rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none transition-all"
                />
                <QrCode className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#404754]" />
                {showProductDropdown && productResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-[#c0c6d6] rounded shadow-lg max-h-72 overflow-auto">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addProduct(p)}
                        className="w-full text-left px-3 py-2 hover:bg-[#ebf5ff] flex items-center justify-between gap-2 border-b last:border-0 border-[#c0c6d6]"
                      >
                        <div>
                          <p className="text-sm font-medium text-[#0d1d29]">{p.name}</p>
                          <p className="text-xs text-[#404754]">
                            SKU: {p.sku || "—"} {p.unit ? ` • ${p.unit}` : ""}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-[#005baf]">{fmtMoney(p.price)}đ</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cart table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-50 py-12">
                  <ShoppingCart className="w-16 h-16 mb-4 text-[#c0c6d6]" />
                  <p className="text-sm text-[#0d1d29]">Chưa có sản phẩm nào trong đơn hàng</p>
                  <p className="text-xs text-[#404754] mt-1">Gõ tên sản phẩm, SKU hoặc quét barcode để thêm</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white z-10 border-b border-[#c0c6d6]">
                    <tr>
                      <th className="p-2 pl-4 text-xs font-semibold text-[#404754] uppercase tracking-wider w-12">STT</th>
                      <th className="p-2 text-xs font-semibold text-[#404754] uppercase tracking-wider">Sản phẩm</th>
                      <th className="p-2 text-xs font-semibold text-[#404754] uppercase tracking-wider text-right">Số lượng</th>
                      <th className="p-2 text-xs font-semibold text-[#404754] uppercase tracking-wider text-right">Đơn giá</th>
                      <th className="p-2 text-xs font-semibold text-[#404754] uppercase tracking-wider text-right">Thành tiền</th>
                      <th className="p-2 pr-4 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c0c6d6]">
                    {cart.map((c, idx) => (
                      <tr key={c.product_id} className="hover:bg-[#f6f9ff] transition-colors">
                        <td className="p-4 text-center text-xs text-[#404754]">{idx + 1}</td>
                        <td className="p-4">
                          <div className="flex items-start gap-2">
                            <div className="w-10 h-10 rounded border border-[#c0c6d6] flex-shrink-0 bg-white overflow-hidden">
                              {c.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={c.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-[#ebf5ff] flex items-center justify-center text-[#c0c6d6]">
                                  <ReceiptText className="w-5 h-5" />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-sm text-[#005baf] font-medium">{c.product_name}</p>
                              <p className="text-xs text-[#404754]">SKU: {c.product_sku || "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="inline-flex border border-[#717785] rounded overflow-hidden">
                            <button
                              onClick={() => updateQty(c.product_id, c.quantity - 1)}
                              className="px-2 py-1 bg-[#e0f0ff] hover:bg-[#d9eafa] transition-colors text-[#0d1d29]"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="text"
                              value={c.quantity}
                              onChange={(e) => {
                                const v = parseInt(e.target.value || "0", 10);
                                updateQty(c.product_id, isNaN(v) ? 0 : v);
                              }}
                              className="w-12 text-center border-none text-xs focus:ring-0"
                            />
                            <button
                              onClick={() => updateQty(c.product_id, c.quantity + 1)}
                              className="px-2 py-1 bg-[#e0f0ff] hover:bg-[#d9eafa] transition-colors text-[#0d1d29]"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="p-4 text-right text-sm">{fmtMoney(c.unit_price)}</td>
                        <td className="p-4 text-right text-sm font-semibold">{fmtMoney(c.unit_price * c.quantity)}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => removeItem(c.product_id)}
                            className="text-[#404754] hover:text-[#ba1a1a] transition-colors p-1 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Note */}
            <div className="p-4 border-t border-[#c0c6d6]">
              <div className="flex items-start gap-2">
                <StickyNote className="w-5 h-5 text-[#404754] mt-1" />
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ghi chú đơn hàng"
                  className="w-full p-2 border border-[#717785] rounded text-xs focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none h-20 resize-none"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="w-[380px] flex flex-col gap-4 shrink-0">
          {/* Order info */}
          <section className="bg-white border border-[#c0c6d6] rounded p-4 space-y-4">
            <div className="flex justify-between items-center border-b border-[#c0c6d6] pb-2">
              <h3 className="text-xs font-semibold text-[#0d1d29] uppercase">Thông tin đơn hàng</h3>
              <Settings className="w-4 h-4 text-[#404754] cursor-pointer" />
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#404754] mb-1">Nguồn đơn hàng</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full p-2 border border-[#717785] rounded text-xs focus:border-[#005baf] focus:ring-0"
                >
                  {SOURCES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#404754] mb-1">Chi nhánh</label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full p-2 border border-[#717785] rounded text-xs focus:border-[#005baf] focus:ring-0"
                >
                  {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-[#404754] mb-1">Ngày tạo</label>
                  <input
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-full p-2 border border-[#717785] rounded text-xs focus:border-[#005baf] focus:ring-0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#404754] mb-1">Giờ tạo</label>
                  <input
                    value={orderTime}
                    onChange={(e) => setOrderTime(e.target.value)}
                    className="w-full p-2 border border-[#717785] rounded text-xs focus:border-[#005baf] focus:ring-0"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#404754] mb-1">Nhân viên bán hàng</label>
                <div className="p-2 bg-[#e0f0ff] rounded text-xs text-[#0d1d29] border border-[#c0c6d6]">{STAFF}</div>
              </div>
            </div>
          </section>

          {/* Promotion ticker */}
          <div className="bg-[#0074db] text-white px-4 py-2 rounded flex items-center gap-2">
            <Megaphone className="w-4 h-4" />
            <span className="text-xs truncate">Đang có chương trình: Giảm 10% cho đơn hàng trên 500k</span>
          </div>

          {/* Payment summary */}
          <section className="bg-white border border-[#c0c6d6] rounded p-4 flex-1 flex flex-col">
            <div className="flex-1 space-y-3 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#404754]">Tổng tiền sản phẩm ({cart.length})</span>
                <span className="text-sm font-medium">{fmtMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1 group cursor-pointer">
                  <span className="text-sm text-[#005baf]">Chiết khấu</span>
                  <Pencil className="w-3 h-3 text-[#005baf] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 text-right p-1 border border-transparent hover:border-[#717785] focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] rounded text-sm"
                />
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1 group cursor-pointer">
                  <span className="text-sm text-[#005baf]">Phí giao hàng</span>
                  <Pencil className="w-3 h-3 text-[#005baf] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <input
                  type="number"
                  value={shippingFee}
                  onChange={(e) => setShippingFee(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 text-right p-1 border border-transparent hover:border-[#717785] focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] rounded text-sm"
                />
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-dashed border-[#c0c6d6]">
                <span className="text-base font-bold text-[#0d1d29]">Khách phải trả</span>
                <span className="text-base font-bold text-[#005baf]">{fmtMoney(total)}đ</span>
              </div>
            </div>

            {/* Payment method */}
            <div className="mb-4">
              <div className="flex gap-2">
                <PayMethodButton active={paymentMethod === "cash"} onClick={() => setPaymentMethod("cash")} icon={<Banknote className="w-4 h-4" />}>
                  Tiền mặt
                </PayMethodButton>
                <PayMethodButton active={paymentMethod === "transfer"} onClick={() => setPaymentMethod("transfer")} icon={<Wallet className="w-4 h-4" />}>
                  Chuyển khoản
                </PayMethodButton>
                <PayMethodButton active={paymentMethod === "card"} onClick={() => setPaymentMethod("card")} icon={<CreditCard className="w-4 h-4" />}>
                  Quẹt thẻ
                </PayMethodButton>
              </div>
            </div>

            {error && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-2">
              <button
                onClick={() => submit("completed")}
                disabled={submitting || cart.length === 0}
                className="w-full bg-[#005baf] hover:bg-[#005eb3] text-white py-3 rounded font-bold text-sm shadow-sm transition-colors uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Đang lưu..." : "Thanh toán (F10)"}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => submit("new")}
                  disabled={submitting || cart.length === 0}
                  className="flex-1 border border-[#005baf] text-[#005baf] hover:bg-[#ebf5ff] py-2 rounded font-medium text-sm transition-colors disabled:opacity-50"
                >
                  Lưu nháp
                </button>
                <button
                  onClick={() => window.print()}
                  className="w-12 border border-[#717785] text-[#404754] hover:bg-[#ebf5ff] py-2 rounded flex items-center justify-center transition-colors"
                  title="In"
                >
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Hotkey footer */}
      <footer className="h-8 bg-[#e0f0ff] px-6 flex items-center gap-6 border-t border-[#c0c6d6] text-[11px] text-[#5b6571] flex-shrink-0">
        <Hotkey k="F2" label="Tìm sản phẩm" />
        <Hotkey k="F4" label="Tìm khách hàng" />
        <Hotkey k="F10" label="Thanh toán" />
        <div className="ml-auto flex items-center gap-1">
          <Info className="w-3 h-3" />
          <span>v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}

function PayMethodButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 px-1 rounded text-xs flex flex-col items-center justify-center gap-1 transition-all ${
        active
          ? "border border-[#005baf] text-[#005baf] bg-[#ebf5ff] font-semibold"
          : "border border-[#717785] text-[#404754] hover:border-[#005baf] hover:text-[#005baf]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Hotkey({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="bg-[#5b6571] text-white px-1 rounded font-bold text-[10px]">{k}</span>
      <span>{label}</span>
    </div>
  );
}
