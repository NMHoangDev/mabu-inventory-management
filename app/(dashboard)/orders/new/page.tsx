"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  X
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
  price: number; // giá lẻ
  cost_price: number; // giá vốn
  wholesale_price: number; // giá sĩ
  image_url: string;
}

interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
}

type PriceTier = "cost" | "wholesale" | "retail";

const TIER_LABELS: Record<PriceTier, string> = {
  cost: "Giá vốn",
  wholesale: "Giá sĩ",
  retail: "Giá lẻ",
};

interface CartItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  unit: string;
  image_url: string;
  price_cost: number;
  price_wholesale: number;
  price_retail: number;
  price_tier: PriceTier;
  quantity: number;
}

// Đơn giá thực tế của 1 line = giá theo price_tier đang chọn (vốn/sĩ/lẻ).
function tierPrice(item: CartItem): number {
  if (item.price_tier === "cost") return item.price_cost;
  if (item.price_tier === "wholesale") return item.price_wholesale;
  return item.price_retail;
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
  const [customerHighlight, setCustomerHighlight] = useState(0);

  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productHighlight, setProductHighlight] = useState(0);

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

  // ── Customer search (debounced + bỏ dấu hỗ trợ) ───────────────────────
  // Backend /api/orders/search-customers đã có unaccent + scoring.
  // Reset highlight khi danh sách đổi.
  useEffect(() => {
    if (customer) return; // đã chọn rồi thì không search nữa
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orders/search-customers?q=${encodeURIComponent(customerSearch)}&limit=12`);
        const data = await res.json();
        setCustomerResults(data.customers ?? []);
        setCustomerHighlight(0);
      } catch {
        /* ignore */
      }
    }, 220);
    return () => clearTimeout(t);
  }, [customerSearch, customer]);

  // ── Product search ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orders/search-products?q=${encodeURIComponent(productSearch)}&limit=12`);
        const data = await res.json();
        setProductResults(data.products ?? []);
        setProductHighlight(0);
      } catch {
        /* ignore */
      }
    }, 220);
    return () => clearTimeout(t);
  }, [productSearch]);

  const productInputRef = useRef<HTMLInputElement | null>(null);
  const customerInputRef = useRef<HTMLInputElement | null>(null);
  // Ref theo product_id — dùng để nhảy focus tới đúng ô số lượng / nút chọn
  // giá của dòng vừa thêm (xem addProduct + updateQty onKeyDown).
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const tierButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // ── Customer actions ───────────────────────────────────────────────────
  const pickCustomer = useCallback((c: Customer) => {
    setCustomer(c);
    setCustomerSearch("");
    setCustomerResults([]);
    // Focus lại vào product input để user tiếp tục thêm SP.
    setTimeout(() => productInputRef.current?.focus(), 0);
  }, []);

  const clearCustomer = useCallback(() => {
    setCustomer(null);
    setTimeout(() => customerInputRef.current?.focus(), 0);
  }, []);

  // ── Product actions ────────────────────────────────────────────────────
  const addProduct = useCallback((p: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === p.id);
      if (existing) {
        return prev.map((c) => (c.product_id === p.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          product_sku: p.sku,
          unit: p.unit,
          image_url: p.image_url,
          price_cost: p.cost_price,
          price_wholesale: p.wholesale_price,
          price_retail: p.price,
          price_tier: "retail" as PriceTier,
          quantity: 1,
        },
      ];
    });
    setProductSearch("");
    setProductResults([]);
    setProductHighlight(0);
    // UX: sau khi thêm SP, nhảy thẳng vào ô số lượng của ĐÚNG dòng vừa thêm
    // (không refocus vào ô tìm SP nữa) để user gõ số lượng ngay — Enter ở ô
    // số lượng sẽ tiếp tục nhảy qua nút chọn giá (xem input số lượng bên dưới).
    setTimeout(() => {
      const el = qtyInputRefs.current[p.id];
      el?.focus();
      el?.select();
    }, 0);
    // Ghi nhớ tìm kiếm: tăng use_count cho sản phẩm này — lần search sau với
    // từ khóa khớp sản phẩm đã thêm sẽ được ưu tiên lên trước. Fire-and-forget,
    // không chặn UI nếu lỗi.
    void fetch("/api/orders/search-products/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: p.id }),
    }).catch(() => undefined);
  }, []);

  const updateQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.product_id !== productId));
      return;
    }
    setCart((prev) => prev.map((c) => (c.product_id === productId ? { ...c, quantity: qty } : c)));
  };

  const setTier = (productId: string, tier: PriceTier) => {
    setCart((prev) => prev.map((c) => (c.product_id === productId ? { ...c, price_tier: tier } : c)));
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  };

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.quantity * tierPrice(c), 0), [cart]);
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
        payment_method: paymentMethod === "transfer" ? "bank_transfer" : paymentMethod,
        status,
        items: cart.map((c) => ({
          product_id: c.product_id,
          product_name: c.product_name,
          product_sku: c.product_sku,
          unit: c.unit,
          image_url: c.image_url,
          quantity: c.quantity,
          unit_price: tierPrice(c),
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
    <div className="flex flex-col min-h-screen bg-[#f4f6f8]">
      {/* Top app bar */}
      <header className="h-14 bg-white border-b border-[#c0c6d6] flex justify-between items-center px-6 shrink-0 sticky top-0 z-20">
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
      <main className="flex-1 flex gap-4 p-6">
        {/* Left column */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Customer search */}
          <CustomerSearch
            customer={customer}
            customerSearch={customerSearch}
            customerResults={customerResults}
            customerHighlight={customerHighlight}
            customerInputRef={customerInputRef}
            onSearchChange={(v) => {
              setCustomer(null);
              setCustomerSearch(v);
            }}
            onPick={pickCustomer}
            onClear={clearCustomer}
            onHighlight={setCustomerHighlight}
            onFetchInitial={() => {
              // Gọi fetch ngay (dù search rỗng) để dropdown có data hiển thị
              // khi user vừa focus vào input. Set customerSearch = "" rồi
              // trigger lại effect search bằng cách gọi setter 2 lần — nhưng
              // đơn giản hơn: gọi thẳng fetch ở đây.
              void fetch(
                `/api/orders/search-customers?q=&limit=12`,
                { cache: "no-store" }
              )
                .then((r) => r.json().catch(() => ({})))
                .then((data: { customers?: Customer[] }) => {
                  setCustomerResults(data.customers ?? []);
                  setCustomerHighlight(0);
                })
                .catch(() => undefined);
            }}
            onKeyDown={(e) => {
              if (customerResults.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCustomerHighlight((h) => Math.min(customerResults.length - 1, h + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCustomerHighlight((h) => Math.max(0, h - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pickCustomer(customerResults[customerHighlight]);
              } else if (e.key === "Escape") {
                setCustomerSearch("");
                setCustomerResults([]);
              }
            }}
          />

          {/* Product search + cart */}
          <section className="bg-white border border-[#c0c6d6] rounded flex-1 flex flex-col min-h-0">
            <ProductSearch
              productSearch={productSearch}
              productResults={productResults}
              productHighlight={productHighlight}
              productInputRef={productInputRef}
              onSearchChange={(v) => setProductSearch(v)}
              onPick={addProduct}
              onHighlight={setProductHighlight}
              onFetchInitial={() => {
                // Fetch ngay khi focus (dù search rỗng) — dropdown có data
                // ngay từ đầu, user thấy được các sản phẩm gợi ý.
                void fetch(`/api/orders/search-products?q=&limit=12`, {
                  cache: "no-store",
                })
                  .then((r) => r.json().catch(() => ({})))
                  .then((data: { products?: Product[] }) => {
                    setProductResults(data.products ?? []);
                    setProductHighlight(0);
                  })
                  .catch(() => undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setProductHighlight((h) => Math.min(productResults.length - 1, h + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setProductHighlight((h) => Math.max(0, h - 1));
                } else if (e.key === "Enter") {
                  if (productResults.length > 0) {
                    e.preventDefault();
                    addProduct(productResults[productHighlight]);
                  }
                } else if (e.key === "Escape") {
                  setProductSearch("");
                  setProductResults([]);
                }
              }}
            />

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
                      <th className="p-2 text-xs font-semibold text-[#404754] uppercase tracking-wider text-right">Loại giá</th>
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
                              ref={(el) => {
                                qtyInputRefs.current[c.product_id] = el;
                              }}
                              type="text"
                              value={c.quantity}
                              onChange={(e) => {
                                const v = parseInt(e.target.value || "0", 10);
                                updateQty(c.product_id, isNaN(v) ? 0 : v);
                              }}
                              onFocus={(e) => e.target.select()}
                              onKeyDown={(e) => {
                                // UX: sau khi gõ số lượng, Enter nhảy tiếp qua nút
                                // chọn loại giá (vốn/sĩ/lẻ) của ĐÚNG dòng này.
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  tierButtonRefs.current[c.product_id]?.focus();
                                }
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
                        <td className="p-4 text-right">
                          <div className="inline-flex gap-1 justify-end" role="group" aria-label="Chọn loại giá">
                            {(["cost", "wholesale", "retail"] as PriceTier[]).map((tier, tierIdx, arr) => (
                              <button
                                key={tier}
                                type="button"
                                // Ref gắn vào nút đang ACTIVE — ô số lượng nhảy Enter
                                // tới đây nên phải luôn là nút đang chọn của dòng này.
                                ref={
                                  c.price_tier === tier
                                    ? (el) => {
                                        tierButtonRefs.current[c.product_id] = el;
                                      }
                                    : undefined
                                }
                                onClick={() => setTier(c.product_id, tier)}
                                onKeyDown={(e) => {
                                  // ← → để duyệt nhanh giữa 3 loại giá cùng dòng.
                                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                                    e.preventDefault();
                                    const dir = e.key === "ArrowRight" ? 1 : -1;
                                    const nextTier = arr[(tierIdx + dir + arr.length) % arr.length];
                                    setTier(c.product_id, nextTier);
                                    (e.currentTarget.parentElement?.children[
                                      (tierIdx + dir + arr.length) % arr.length
                                    ] as HTMLButtonElement | undefined)?.focus();
                                  }
                                }}
                                title={TIER_LABELS[tier]}
                                className={`px-1.5 py-1 rounded text-[10px] font-semibold transition-colors ${
                                  c.price_tier === tier
                                    ? "bg-[#005baf] text-white"
                                    : "bg-[#ebf5ff] text-[#005baf] hover:bg-[#d9eafa]"
                                }`}
                              >
                                {tier === "cost" ? "Vốn" : tier === "wholesale" ? "Sĩ" : "Lẻ"}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="p-4 text-right text-sm">{fmtMoney(tierPrice(c))}</td>
                        <td className="p-4 text-right text-sm font-semibold">{fmtMoney(tierPrice(c) * c.quantity)}</td>
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
                {submitting ? "Đang lưu..." : "Tạo đơn hàng"}
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers chung cho dropdown
// ─────────────────────────────────────────────────────────────────────────────

// Bỏ dấu tiếng Việt + lowercase + giữ chữ/số/khoảng trắng để highlight.
function removeAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Highlight phần text khớp với query (hỗ trợ không dấu) — không làm hỏng dấu gốc.
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const qAcc = removeAccents(q);
  const lower = text.toLowerCase();
  const lowerAcc = removeAccents(text);
  // Tìm vị trí match trên chuỗi không dấu, map lại index trên chuỗi gốc.
  const idx = lowerAcc.indexOf(qAcc);
  if (idx < 0) return <>{text}</>;
  // Dùng index của lowerAcc (chuỗi không dấu) để slice trên text gốc
  // cũng OK vì pre-composed char và decomposed char cùng độ dài trong trường hợp
  // không chứa dấu. Với text có dấu thì lowerAcc dài hơn → cần map index.
  // Đơn giản hoá: tìm lại trên lower (giữ dấu) để highlight chính xác phần đầu.
  const startInOriginal = lower.indexOf(text.substring(idx, idx + q.length).toLowerCase());
  if (startInOriginal < 0) return <>{text}</>;
  const end = startInOriginal + q.length;
  return (
    <>
      {text.substring(0, startInOriginal)}
      <mark className="bg-yellow-200 text-[#0d1d29] rounded px-0.5">
        {text.substring(startInOriginal, end)}
      </mark>
      {text.substring(end)}
    </>
  );
}

// Hook chung: click-outside + ESC để đóng dropdown.
// Trả về ref gắn vào wrapper + open state.
function useDismiss(open: boolean, onDismiss: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (ref.current && !ref.current.contains(target)) onDismiss();
    };
    // mousedown thay vì click để đóng TRƯỚC khi button trong dropdown nhận click
    // (button nhận onMouseDown nhưng không preventDefault → click vẫn fire).
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onDismiss]);
  return ref;
}

// Khi `open=true` thêm ESC handler để đóng.
function useEscape(open: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onEscape]);
}

// ─────────────────────────────────────────────────────────────────────────────
// CustomerSearch — input search có dropdown chọn KH.
//   - Click chọn KH trong dropdown → setCustomer + reset search + focus product input.
//   - ESC / click ngoài / chọn xong → đóng dropdown.
//   - ↑ ↓ Enter để chọn nhanh bằng bàn phím.
//   - Số kết quả hiển thị 12, có thể bấm "Quản lý KH" để tạo mới.
// ─────────────────────────────────────────────────────────────────────────────

interface CustomerSearchProps {
  customer: Customer | null;
  customerSearch: string;
  customerResults: Customer[];
  customerHighlight: number;
  customerInputRef: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (v: string) => void;
  onPick: (c: Customer) => void;
  onClear: () => void;
  onHighlight: (n: number) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  // Bắt buộc: gọi khi user focus vào input để component cha trigger 1 lần
  // fetch ngay (dù search rỗng) — đảm bảo dropdown có data để hiển thị ngay
  // lúc focus, không phải đợi user gõ.
  onFetchInitial: () => void;
}

function CustomerSearch({
  customer,
  customerSearch,
  customerResults,
  customerHighlight,
  customerInputRef,
  onSearchChange,
  onPick,
  onClear,
  onHighlight,
  onKeyDown,
  onFetchInitial
}: CustomerSearchProps) {
  // Dropdown mở/đóng do focus + có data. Click outside / ESC mới đóng.
  // KHÔNG phụ thuộc vào customerResults.length (nếu không, focus vào input
  // mà chưa gõ → dropdown vẫn đóng → user không biết phải gõ).
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const showDropdown = !customer && dropdownOpen;
  const dismiss = useCallback(() => setDropdownOpen(false), []);
  const wrapperRef = useDismiss(showDropdown, dismiss);
  useEscape(showDropdown, dismiss);

  return (
    <section
      ref={wrapperRef}
      className="bg-white border border-[#c0c6d6] rounded p-4 relative"
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#404754]" />
        {customer ? (
          <>
            <div className="w-full pl-10 pr-10 py-2 border border-[#717785] rounded text-sm flex items-center gap-2 bg-[#f6f9ff]">
              <span className="font-semibold text-[#0d1d29] truncate">{customer.name}</span>
              <span className="text-xs text-[#404754] truncate">
                {customer.phone || customer.code || customer.email || "—"}
              </span>
            </div>
            <button
              type="button"
              onClick={onClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#404754] hover:text-[#0d1d29] p-1 rounded hover:bg-[#ebf5ff]"
              title="Bỏ chọn khách hàng"
              aria-label="Bỏ chọn khách hàng"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <input
              ref={customerInputRef}
              value={customerSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => {
                setDropdownOpen(true);
                onFetchInitial();
              }}
              onKeyDown={onKeyDown}
              placeholder="Tìm kiếm khách hàng (F4) — gõ không dấu cũng ra"
              autoComplete="off"
              className="w-full pl-10 pr-10 py-2 border border-[#717785] rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none transition-all"
            />
            <Link
              href="/customers"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#005baf] hover:bg-[#ebf5ff] p-1 rounded"
              title="Thêm khách hàng mới"
            >
              <UserPlus className="w-5 h-5" />
            </Link>
          </>
        )}
      </div>

      {showDropdown ? (
        <div className="absolute z-30 left-4 right-4 top-full mt-1 bg-white border border-[#c0c6d6] rounded shadow-xl max-h-72 overflow-auto">
          {customerResults.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-500">
              Không tìm thấy khách hàng
              {customerSearch.trim() ? ` với "${customerSearch.trim()}"` : ""}.
              <br />
              Bấm <Link href="/customers" className="text-[#005baf] font-semibold hover:underline">+ Thêm KH mới</Link> để tạo.
            </div>
          ) : null}
          {customerResults.map((c, idx) => {
            const active = idx === customerHighlight;
            return (
              <button
                // mousedown (không phải click) + preventDefault để button nhận
                // event trước khi input blur → tránh race condition dropdown đóng
                // mất item. Đồng thời useDismiss ở trên cũng bỏ qua click trong
                // wrapper nhờ ref check.
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setDropdownOpen(false);
                  onPick(c);
                }}
                onMouseEnter={() => onHighlight(idx)}
                className={`w-full text-left px-3 py-2 flex flex-col border-b last:border-0 border-[#c0c6d6] transition-colors ${
                  active ? "bg-[#ebf5ff]" : "hover:bg-[#f6f9ff]"
                }`}
              >
                <span className="text-sm font-medium text-[#0d1d29]">
                  <HighlightMatch text={c.name} query={customerSearch} />
                </span>
                <span className="text-xs text-[#404754]">
                  <HighlightMatch
                    text={c.phone || c.code || c.email || "—"}
                    query={customerSearch}
                  />
                </span>
              </button>
            );
          })}
          <div className="px-3 py-1.5 text-[10px] text-[#5b6571] bg-[#f6f9ff] border-t border-[#c0c6d6] flex items-center justify-between">
            <span>↑↓ để di chuyển · Enter chọn · Esc đóng</span>
            <Link href="/customers" className="text-[#005baf] hover:underline">
              + Thêm KH mới
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProductSearch — input search có dropdown chọn SP để thêm vào giỏ.
//   - Click chọn SP → addProduct + reset search + focus input.
//   - ↑ ↓ Enter / Esc / click ngoài → đóng dropdown.
//   - Highlight phần match (kể cả khi user gõ không dấu).
//   - Hiển thị ảnh + tên + SKU + giá.
// ─────────────────────────────────────────────────────────────────────────────

interface ProductSearchProps {
  productSearch: string;
  productResults: Product[];
  productHighlight: number;
  productInputRef: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (v: string) => void;
  onPick: (p: Product) => void;
  onHighlight: (n: number) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  // Bắt buộc: gọi khi user focus vào input để component cha trigger 1 lần
  // fetch ngay (dù search rỗng) — đảm bảo dropdown có data hiển thị ngay.
  onFetchInitial: () => void;
}

function ProductSearch({
  productSearch,
  productResults,
  productHighlight,
  productInputRef,
  onSearchChange,
  onPick,
  onHighlight,
  onKeyDown,
  onFetchInitial
}: ProductSearchProps) {
  // Dropdown mở/đóng do focus + có data (KHÔNG clear search khi click outside).
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const showDropdown = dropdownOpen;
  const dismiss = useCallback(() => setDropdownOpen(false), []);
  const wrapperRef = useDismiss(showDropdown, dismiss);
  useEscape(showDropdown, dismiss);

  return (
    <div ref={wrapperRef} className="p-4 border-b border-[#c0c6d6]">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#404754]" />
        <input
          ref={productInputRef}
          value={productSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => {
            setDropdownOpen(true);
            onFetchInitial();
          }}
          onKeyDown={onKeyDown}
          placeholder="Tìm theo tên, mã SKU, barcode (F2) — gõ không dấu cũng ra"
          autoComplete="off"
          className="w-full pl-10 pr-10 py-2 border border-[#717785] rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none transition-all"
        />
        <QrCode className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#404754]" />

        {showDropdown ? (
          <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-[#c0c6d6] rounded shadow-xl max-h-80 overflow-auto">
            {productResults.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                Không tìm thấy sản phẩm
                {productSearch.trim() ? ` với "${productSearch.trim()}"` : ""}.
                <br />
                Gõ tên, SKU hoặc quét barcode để tìm.
              </div>
            ) : null}
            {productResults.map((p, idx) => {
              const active = idx === productHighlight;
              return (
                <button
                  type="button"
                  key={p.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDropdownOpen(false);
                    onPick(p);
                  }}
                  onMouseEnter={() => onHighlight(idx)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 border-b last:border-0 border-[#c0c6d6] transition-colors ${
                    active ? "bg-[#ebf5ff]" : "hover:bg-[#f6f9ff]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded border border-[#c0c6d6] shrink-0 bg-white overflow-hidden">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[#ebf5ff] flex items-center justify-center text-[#c0c6d6]">
                          <ReceiptText className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0d1d29] truncate">
                        <HighlightMatch text={p.name} query={productSearch} />
                      </p>
                      <p className="text-xs text-[#404754] truncate">
                        SKU: <HighlightMatch text={p.sku || "—"} query={productSearch} />
                        {p.unit ? ` • ${p.unit}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-[#005baf] tabular-nums shrink-0">
                    {fmtMoney(p.price)}đ
                  </span>
                </button>
              );
            })}
            <div className="px-3 py-1.5 text-[10px] text-[#5b6571] bg-[#f6f9ff] border-t border-[#c0c6d6]">
              ↑↓ di chuyển · Enter thêm vào đơn · Esc đóng
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
