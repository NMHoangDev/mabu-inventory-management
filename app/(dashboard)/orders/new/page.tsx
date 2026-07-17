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
  X,
  ChevronDown,
  Loader2
} from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
  price: number; // giá lẻ
  cost_price: number; // giá vốn
  wholesale_price: number; // giá sĩ
  image_url: string;
  stock: number;
  track_inventory: boolean;
  allow_negative_stock: boolean;
}

interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
}

type PriceTier = "cost" | "wholesale" | "retail";
type DiscountType = "amount" | "percent";

const TIER_LABELS: Record<PriceTier, string> = {
  cost: "Giá vốn",
  wholesale: "Giá bán sỉ",
  retail: "Giá bán lẻ",
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
  custom_price: number | null;
  discount_type: DiscountType;
  discount_value: number;
  quantity: number;
  note: string;
  stock: number;
  track_inventory: boolean;
  allow_negative_stock: boolean;
}

// Sản phẩm bị chọn số lượng vượt tồn kho — chỉ cảnh báo với SP có theo dõi tồn
// kho (track_inventory) và KHÔNG cho phép bán âm kho (allow_negative_stock).
function isOverStock(item: CartItem): boolean {
  return item.track_inventory && !item.allow_negative_stock && item.quantity > item.stock;
}

// Đơn giá theo bảng giá (vốn/sĩ/lẻ) đang chọn — dùng làm mặc định trước khi
// người dùng tự sửa tay (xem unitPrice).
function tierPrice(item: CartItem): number {
  if (item.price_tier === "cost") return item.price_cost;
  if (item.price_tier === "wholesale") return item.price_wholesale;
  return item.price_retail;
}

// Đơn giá thực tế của 1 dòng: ưu tiên giá đã tự sửa tay (custom_price), nếu
// chưa sửa thì lấy theo bảng giá đang chọn.
function unitPrice(item: CartItem): number {
  return item.custom_price ?? tierPrice(item);
}

// Chiết khấu TỪNG SẢN PHẨM (không phải chiết khấu tổng đơn) — value hoặc %,
// clamp về [0, thành tiền gốc trước chiết khấu] để không ra số âm.
function lineBase(item: CartItem): number {
  return unitPrice(item) * item.quantity;
}
function lineDiscountAmount(item: CartItem): number {
  const base = lineBase(item);
  const raw = item.discount_type === "percent" ? (base * item.discount_value) / 100 : item.discount_value;
  return Math.min(base, Math.max(0, raw));
}
// Chiết khấu TỔNG ĐƠN (khác chiết khấu từng dòng ở trên) — tính trên phần
// còn lại sau khi đã trừ chiết khấu từng dòng, clamp về [0, base].
function orderDiscountAmount(base: number, discountType: DiscountType, discountValue: number): number {
  const raw = discountType === "percent" ? (base * discountValue) / 100 : discountValue;
  return Math.min(base, Math.max(0, raw));
}
function lineTotal(item: CartItem): number {
  return Math.max(0, lineBase(item) - lineDiscountAmount(item));
}

function parseNum(text: string): number {
  const v = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

// Hiển thị số có dấu phẩy phân cách hàng nghìn trong input (vd 1,000,000) —
// áp dụng cho mọi ô nhập số ở trang này. parseNum ở trên đã tự bỏ dấu phẩy
// khi đọc lại giá trị nên không cần đổi logic onChange.
function formatNumberInput(n: number): string {
  if (!n) return "";
  return n.toLocaleString("en-US");
}

const SOURCES = [
  { v: "store", l: "Tại cửa hàng" },
  { v: "facebook", l: "Facebook" },
  { v: "website", l: "Website" },
  { v: "zalo", l: "Zalo" },
];
const BRANCHES = ["Chi nhánh chính", "Chi nhánh trung tâm", "Kho Quận 1"];
const STAFF = "Nguyễn Văn A";

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
  // Bảng giá mặc định áp cho SẢN PHẨM MỚI thêm vào đơn + các dòng chưa bị sửa
  // giá tay (custom_price === null) khi đổi — hiển thị cạnh ô tìm sản phẩm.
  const [priceTier, setPriceTier] = useState<PriceTier>("retail");
  const [source, setSource] = useState("store");
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [orderDate, setOrderDate] = useState(fmtDate(new Date()));
  const [orderTime, setOrderTime] = useState(fmtTime(new Date()));
  const [note, setNote] = useState("");

  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<DiscountType>("amount");
  const [shippingFee, setShippingFee] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "card">("cash");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Popup xem nhanh tồn kho — bấm icon ghi chú cạnh tên sản phẩm trong giỏ.
  const [stockModalProductId, setStockModalProductId] = useState<string | null>(null);

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
  // Ref theo product_id — dùng để nhảy focus tới đúng ô số lượng / đơn giá
  // của dòng vừa thêm (xem addProduct + updateQty onKeyDown).
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Ghi chú đơn hàng (chung cho cả đơn) — nhập ở textarea cuối danh sách SP.
  const orderNoteRef = useRef<HTMLTextAreaElement | null>(null);
  // Ghi chú RIÊNG từng sản phẩm (order-item) — bấm icon ghi chú cạnh tên SP
  // để bật/tắt 1 ô input nhỏ ngay dưới tên SP đó, khác với ghi chú đơn ở trên.
  const [noteExpandedIds, setNoteExpandedIds] = useState<Set<string>>(new Set());
  const itemNoteInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const toggleItemNote = useCallback((productId: string) => {
    setNoteExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
    setTimeout(() => itemNoteInputRefs.current[productId]?.focus(), 0);
  }, []);
  const setItemNote = (productId: string, note: string) => {
    setCart((prev) => prev.map((c) => (c.product_id === productId ? { ...c, note } : c)));
  };

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
          price_tier: priceTier,
          custom_price: null,
          discount_type: "amount" as DiscountType,
          discount_value: 0,
          quantity: 1,
          note: "",
          stock: p.stock,
          track_inventory: p.track_inventory,
          allow_negative_stock: p.allow_negative_stock,
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
  }, [priceTier]);

  const updateQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.product_id !== productId));
      return;
    }
    setCart((prev) => prev.map((c) => (c.product_id === productId ? { ...c, quantity: qty } : c)));
  };

  // Sửa tay Đơn giá của 1 dòng — cho phép chỉnh giá bán khác giá niêm yết.
  const setCustomPrice = (productId: string, price: number) => {
    setCart((prev) => prev.map((c) => (c.product_id === productId ? { ...c, custom_price: price } : c)));
  };

  // Chiết khấu TỪNG SẢN PHẨM — value nhập tay, đơn vị theo discount_type.
  const setItemDiscountValue = (productId: string, value: number) => {
    setCart((prev) => prev.map((c) => (c.product_id === productId ? { ...c, discount_value: value } : c)));
  };
  const toggleItemDiscountType = (productId: string) => {
    setCart((prev) =>
      prev.map((c) =>
        c.product_id === productId ? { ...c, discount_type: c.discount_type === "percent" ? "amount" : "percent" } : c
      )
    );
  };

  // Đổi bảng giá áp dụng cho cả đơn (nút cạnh ô tìm sản phẩm) — chỉ re-price
  // những dòng CHƯA sửa giá tay, giữ nguyên giá đã custom_price.
  const handlePriceTierChange = (tier: PriceTier) => {
    setPriceTier(tier);
    setCart((prev) => prev.map((c) => (c.custom_price === null ? { ...c, price_tier: tier } : c)));
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  };

  const overStockItems = useMemo(() => cart.filter(isOverStock), [cart]);

  const subtotal = useMemo(() => cart.reduce((s, c) => s + lineBase(c), 0), [cart]);
  const itemDiscountTotal = useMemo(() => cart.reduce((s, c) => s + lineDiscountAmount(c), 0), [cart]);
  const discountBase = useMemo(() => Math.max(0, subtotal - itemDiscountTotal), [subtotal, itemDiscountTotal]);
  const discountAmount = useMemo(
    () => orderDiscountAmount(discountBase, discountType, discount),
    [discountBase, discountType, discount]
  );
  const total = useMemo(
    () => Math.max(0, discountBase - discountAmount + shippingFee),
    [discountBase, discountAmount, shippingFee]
  );

  const submit = async (status: "new" | "completed") => {
    if (cart.length === 0) {
      setError("Đơn hàng phải có ít nhất 1 sản phẩm.");
      return;
    }
    // "Tạo đơn hàng" (completed) trừ kho ngay — chặn nếu có SP vượt tồn kho
    // (xem isOverStock). "Lưu nháp" (new) không đụng tới kho nên không chặn.
    if (status === "completed" && overStockItems.length > 0) {
      setError(
        `Vượt tồn kho: ${overStockItems.map((c) => `${c.product_name} (đặt ${c.quantity}, còn ${c.stock})`).join(", ")}.`
      );
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      // Đơn tạo từ /orders/new luôn ở trạng thái "chờ thanh toán" — thanh
      // toán được xác nhận sau, riêng, tại trang chi tiết đơn (nút "Thanh
      // toán ngay", xem markPaidNow() ở app/(dashboard)/orders/[id]/page.tsx).
      // "status" completed/new chỉ quyết định có trừ kho ngay hay không,
      // không liên quan tới đã thanh toán hay chưa.
      const payload = {
        customer_id: customer?.id ?? null,
        customer_name: customer?.name ?? "Khách lẻ",
        customer_phone: customer?.phone ?? "",
        source,
        branch,
        staff: STAFF,
        note,
        discount,
        discount_type: discountType,
        shipping_fee: shippingFee,
        paid: 0,
        payment_status: "unpaid",
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
          unit_price: unitPrice(c),
          discount_type: c.discount_type,
          discount_value: c.discount_value,
          note: c.note,
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
              priceTier={priceTier}
              onPriceTierChange={handlePriceTierChange}
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
                      <th className="p-2 text-xs font-semibold text-[#404754] uppercase tracking-wider text-right">Đơn giá</th>
                      <th className="p-2 text-xs font-semibold text-[#404754] uppercase tracking-wider text-right">Chiết khấu</th>
                      <th className="p-2 text-xs font-semibold text-[#404754] uppercase tracking-wider text-right">Thành tiền</th>
                      <th className="p-2 pr-4 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c0c6d6]">
                    {cart.map((c, idx) => (
                      <tr key={c.product_id} className="hover:bg-[#f6f9ff] transition-colors">
                        <td className="p-5 text-center text-xs text-[#404754]">{idx + 1}</td>
                        <td className="p-5">
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded border border-[#c0c6d6] flex-shrink-0 bg-white overflow-hidden">
                              {c.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={c.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-[#ebf5ff] flex items-center justify-center text-[#c0c6d6]">
                                  <ReceiptText className="w-6 h-6" />
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm text-[#005baf] font-medium">{c.product_name}</p>
                                <button
                                  type="button"
                                  onClick={() => setStockModalProductId(c.product_id)}
                                  title="Xem nhanh tồn kho"
                                  className="text-[#404754] hover:text-[#005baf] transition-colors"
                                >
                                  <Info className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="mt-1 flex items-center gap-1.5">
                                <p className="text-xs text-[#404754]">SKU: {c.product_sku || "—"}</p>
                                <button
                                  type="button"
                                  onClick={() => toggleItemNote(c.product_id)}
                                  title="Ghi chú cho sản phẩm này"
                                  className={`transition-colors ${
                                    c.note ? "text-[#005baf]" : "text-[#404754] hover:text-[#005baf]"
                                  }`}
                                >
                                  <StickyNote className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {noteExpandedIds.has(c.product_id) ? (
                                <input
                                  ref={(el) => {
                                    itemNoteInputRefs.current[c.product_id] = el;
                                  }}
                                  type="text"
                                  value={c.note}
                                  onChange={(e) => setItemNote(c.product_id, e.target.value)}
                                  placeholder="Ghi chú cho sản phẩm này..."
                                  className="mt-1 w-48 p-1 border border-[#c0c6d6] rounded text-xs focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
                                />
                              ) : c.note ? (
                                <p className="mt-1 text-xs text-[#404754] italic truncate max-w-[12rem]">{c.note}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="p-5 text-right">
                          <div
                            className={`inline-flex border rounded overflow-hidden ${
                              isOverStock(c) ? "border-[#ba1a1a]" : "border-[#717785]"
                            }`}
                          >
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
                              value={formatNumberInput(c.quantity)}
                              onChange={(e) => updateQty(c.product_id, Math.round(parseNum(e.target.value)))}
                              onFocus={(e) => e.target.select()}
                              onKeyDown={(e) => {
                                // UX: sau khi gõ số lượng, Enter nhảy tiếp qua ô
                                // Đơn giá của ĐÚNG dòng này.
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const el = priceInputRefs.current[c.product_id];
                                  el?.focus();
                                  el?.select();
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
                          {isOverStock(c) ? (
                            <p className="mt-1 text-[11px] text-[#ba1a1a] font-medium whitespace-nowrap">
                              Vượt tồn kho (còn {c.stock})
                            </p>
                          ) : null}
                        </td>
                        <td className="p-5 text-right">
                          <input
                            ref={(el) => {
                              priceInputRefs.current[c.product_id] = el;
                            }}
                            type="text"
                            value={formatNumberInput(unitPrice(c))}
                            onChange={(e) => setCustomPrice(c.product_id, parseNum(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            className="w-24 text-right p-1 border border-transparent hover:border-[#717785] focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] rounded text-sm outline-none"
                          />
                        </td>
                        <td className="p-5 text-right">
                          <div className="inline-flex items-center gap-1 justify-end">
                            <input
                              type="text"
                              value={formatNumberInput(c.discount_value)}
                              onChange={(e) => setItemDiscountValue(c.product_id, parseNum(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              placeholder="0"
                              className="w-16 text-right p-1 border border-transparent hover:border-[#717785] focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] rounded text-sm outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => toggleItemDiscountType(c.product_id)}
                              title="Đổi đơn vị chiết khấu (số tiền / phần trăm)"
                              className="w-7 shrink-0 px-1.5 py-1 rounded text-[10px] font-semibold bg-[#ebf5ff] text-[#005baf] hover:bg-[#d9eafa] transition-colors"
                            >
                              {c.discount_type === "percent" ? "%" : "đ"}
                            </button>
                          </div>
                        </td>
                        <td className="p-5 text-right text-sm font-semibold">{formatCurrencyVND(lineTotal(c))}</td>
                        <td className="p-5 text-right">
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
                  ref={orderNoteRef}
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
         

          {/* Payment summary */}
          <section className="bg-white border border-[#c0c6d6] rounded p-4 flex-1 flex flex-col">
            <div className="flex-1 space-y-3 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#404754]">Tổng tiền sản phẩm ({cart.length})</span>
                <span className="text-sm font-medium">{formatCurrencyVND(subtotal)}</span>
              </div>
              {itemDiscountTotal > 0 ? (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#404754]">Chiết khấu sản phẩm</span>
                  <span className="text-sm font-medium text-[#ba1a1a]">-{formatCurrencyVND(itemDiscountTotal)}</span>
                </div>
              ) : null}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1 group cursor-pointer">
                  <span className="text-sm text-[#005baf]">Chiết khấu đơn</span>
                  <Pencil className="w-3 h-3 text-[#005baf] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="inline-flex items-center gap-1 justify-end">
                  <input
                    type="text"
                    value={formatNumberInput(discount)}
                    onChange={(e) => setDiscount(parseNum(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="w-24 text-right p-1 border border-transparent hover:border-[#717785] focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] rounded text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setDiscountType((t) => (t === "percent" ? "amount" : "percent"))}
                    title="Đổi đơn vị chiết khấu (số tiền / phần trăm)"
                    className="w-7 shrink-0 px-1.5 py-1 rounded text-[10px] font-semibold bg-[#ebf5ff] text-[#005baf] hover:bg-[#d9eafa] transition-colors"
                  >
                    {discountType === "percent" ? "%" : "đ"}
                  </button>
                </div>
              </div>
              {discountAmount > 0 ? (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#404754]">Giảm giá đơn</span>
                  <span className="text-sm font-medium text-[#ba1a1a]">-{formatCurrencyVND(discountAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1 group cursor-pointer">
                  <span className="text-sm text-[#005baf]">Phí giao hàng</span>
                  <Pencil className="w-3 h-3 text-[#005baf] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <input
                  type="text"
                  value={formatNumberInput(shippingFee)}
                  onChange={(e) => setShippingFee(parseNum(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  className="w-24 text-right p-1 border border-transparent hover:border-[#717785] focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] rounded text-sm"
                />
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-dashed border-[#c0c6d6]">
                <span className="text-base font-bold text-[#0d1d29]">Khách phải trả</span>
                <span className="text-base font-bold text-[#005baf]">{formatCurrencyVND(total)}</span>
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

      {stockModalProductId ? (
        <ProductStockModal productId={stockModalProductId} onClose={() => setStockModalProductId(null)} />
      ) : null}
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

// ─────────────────────────────────────────────────────────────────────────────
// ProductStockModal — popup "xem nhanh tồn kho" khi bấm icon ghi chú cạnh tên
// sản phẩm trong giỏ hàng. Tồn kho không quản lý theo nhiều chi nhánh thật
// (xem CLAUDE.md: products.stock là nguồn duy nhất) nên chỉ hiển thị 1 số
// tồn duy nhất, không bịa thêm cột "đang giao dịch"/"hàng đang về" như Sapo.
// ─────────────────────────────────────────────────────────────────────────────

interface ProductStockDetail {
  id: string;
  name: string;
  sku: string;
  image_url: string;
  price: number;
  wholesale_price: number;
  total_inventory: number;
  available_quantity: number;
}

function ProductStockModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ProductStockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/products/${productId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được thông tin tồn kho.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#c0c6d6]">
          <h3 className="font-semibold text-[#0d1d29]">Tồn kho sản phẩm</h3>
          <button onClick={onClose} className="text-[#404754] hover:text-[#0d1d29]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 text-sm space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-[#404754]">
              <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
            </div>
          ) : error || !detail ? (
            <div className="text-red-600">{error || "Không tìm thấy sản phẩm."}</div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded border border-[#c0c6d6] flex-shrink-0 bg-white overflow-hidden">
                  {detail.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detail.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[#ebf5ff] flex items-center justify-center text-[#c0c6d6]">
                      <ReceiptText className="w-5 h-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[#0d1d29] truncate">{detail.name}</p>
                  <p className="text-xs text-[#404754]">SKU: {detail.sku || "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-dashed border-[#c0c6d6]">
                <InfoStat label="Giá bán lẻ" value={formatCurrencyVND(detail.price)} />
                <InfoStat label="Giá bán sỉ" value={formatCurrencyVND(detail.wholesale_price)} />
              </div>
              <div className="pt-3 border-t border-dashed border-[#c0c6d6]">
                <p className="mb-2 text-xs font-semibold uppercase text-[#404754]">Tồn kho</p>
                <div className="grid grid-cols-2 gap-3">
                  <InfoStat label="Tồn kho" value={String(detail.total_inventory)} />
                  <InfoStat label="Có thể bán" value={String(detail.available_quantity)} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[#404754]">{label}</p>
      <p className="text-base font-semibold text-[#0d1d29]">{value}</p>
    </div>
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
                key={c.id}
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
  priceTier: PriceTier;
  onPriceTierChange: (t: PriceTier) => void;
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
  priceTier,
  onPriceTierChange,
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
    <div className="p-4 border-b border-[#c0c6d6] flex items-center gap-2">
      <div ref={wrapperRef} className="relative flex-1">
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
                    {formatCurrencyVND(p.price)}
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
      <PriceTierDropdown value={priceTier} onChange={onPriceTierChange} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PriceTierDropdown — chọn bảng giá áp dụng cho đơn (vốn/sĩ/lẻ), đặt cạnh ô
// tìm sản phẩm. Đổi bảng giá sẽ re-price các dòng CHƯA sửa giá tay (xem
// handlePriceTierChange) và làm giá mặc định cho sản phẩm thêm mới sau đó.
// ─────────────────────────────────────────────────────────────────────────────

function PriceTierDropdown({ value, onChange }: { value: PriceTier; onChange: (t: PriceTier) => void }) {
  const [open, setOpen] = useState(false);
  const dismiss = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, dismiss);
  useEscape(open, dismiss);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 border border-[#717785] rounded text-sm text-[#0d1d29] hover:bg-[#ebf5ff] transition-colors whitespace-nowrap"
      >
        {TIER_LABELS[value]}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute z-30 right-0 top-full mt-1 bg-white border border-[#c0c6d6] rounded shadow-xl w-44">
          {(["retail", "wholesale", "cost"] as PriceTier[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[#ebf5ff] ${
                value === t ? "text-[#005baf] font-semibold bg-[#f6f9ff]" : "text-[#0d1d29]"
              }`}
            >
              {TIER_LABELS[t]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
