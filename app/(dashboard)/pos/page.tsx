"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Plus,
  X,
  Trash2,
  Minus,
  Loader2,
  Maximize,
  Home,
  HelpCircle,
  ChevronDown,
  Banknote,
  CreditCard,
  Wallet,
  Package,
  StickyNote,
  UserPlus,
  LayoutGrid,
  Pencil,
  ShoppingBag
} from "lucide-react";
import { zaloAuthApi } from "@/lib/zalo-api";
import { formatCurrencyVND } from "@/lib/shared/format";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PosProduct {
  id: string;
  name: string;
  sku: string;
  unit: string;
  price: number;
  cost_price: number;
  wholesale_price: number;
  image_url: string;
}

interface PosCustomer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
}

type PriceTier = "cost" | "wholesale" | "retail";
type PaymentMethod = "cash" | "bank_transfer" | "card";

interface PosCartItem {
  key: string;
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
  quantity: number;
}

type DiscountType = "amount" | "percent";

interface PosTab {
  id: string;
  label: string;
  cart: PosCartItem[];
  customer: PosCustomer | null;
  isShipping: boolean;
  shippingFee: number;
  discount: number;
  discountType?: DiscountType;
  note: string;
  paymentMethod: PaymentMethod;
  amountReceived: number;
}

// Chiết khấu TỔNG ĐƠN — value hoặc %, clamp về [0, base] để không ra số âm.
function orderDiscountAmount(base: number, discountType: DiscountType, discountValue: number): number {
  const raw = discountType === "percent" ? (base * discountValue) / 100 : discountValue;
  return Math.min(base, Math.max(0, raw));
}

const STORAGE_KEY = "pos_tabs_v1";
const BRANCH_NAME = "Chi nhánh mặc định";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  card: "Quẹt thẻ"
};

const TIER_LABELS: Record<PriceTier, string> = {
  cost: "Giá vốn",
  wholesale: "Giá sĩ",
  retail: "Giá lẻ"
};

function tierPrice(item: PosCartItem): number {
  if (item.price_tier === "cost") return item.price_cost;
  if (item.price_tier === "wholesale") return item.price_wholesale;
  return item.price_retail;
}

function unitPrice(item: PosCartItem): number {
  return item.custom_price ?? tierPrice(item);
}

function parseNum(text: string): number {
  const v = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function newTab(label: string): PosTab {
  return {
    id: `tab-${Math.random().toString(36).slice(2, 9)}`,
    label,
    cart: [],
    customer: null,
    isShipping: false,
    shippingFee: 0,
    discount: 0,
    discountType: "amount",
    note: "",
    paymentMethod: "cash",
    amountReceived: 0
  };
}

function nextTabLabel(tabs: PosTab[]): string {
  let max = 0;
  for (const t of tabs) {
    const m = /^Đơn (\d+)$/.exec(t.label);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Đơn ${max + 1}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dismiss helpers (click ngoài / ESC để đóng dropdown) — cùng pattern với
// /orders/new để giữ UX tìm kiếm nhất quán.
// ─────────────────────────────────────────────────────────────────────────────

function useDismiss(open: boolean, onDismiss: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (ref.current && !ref.current.contains(target)) onDismiss();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onDismiss]);
  return ref;
}

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

export default function PosPage() {
  const router = useRouter();

  const [tabs, setTabs] = useState<PosTab[]>([newTab("Đơn 1")]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [hydrated, setHydrated] = useState(false);
  const [staffName, setStaffName] = useState("Nhân viên bán hàng");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; orderId?: string } | null>(null);

  const [noteOpen, setNoteOpen] = useState(false);
  const [quickActionsCollapsed, setQuickActionsCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [customerInfoOpen, setCustomerInfoOpen] = useState(false);
  const [paymentMenuOpen, setPaymentMenuOpen] = useState(false);
  const [priceEditMode, setPriceEditMode] = useState(false);

  const [quickPickerOpen, setQuickPickerOpen] = useState(false);
  const [quickProducts, setQuickProducts] = useState<PosProduct[]>([]);
  const [quickLoading, setQuickLoading] = useState(false);

  // ── Product search (header) ────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<PosProduct[]>([]);
  const [productHighlight, setProductHighlight] = useState(0);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);

  // ── Customer search (sidebar) ──────────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<PosCustomer[]>([]);
  const [customerHighlight, setCustomerHighlight] = useState(0);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);

  const productInputRef = useRef<HTMLInputElement | null>(null);
  const customerInputRef = useRef<HTMLInputElement | null>(null);
  const discountInputRef = useRef<HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  // ── Khôi phục / lưu tabs vào localStorage — giữ nguyên các đơn đang bán
  // dở qua lần refresh, cho tới khi thanh toán xong (giống quầy POS thật). ──
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { tabs?: PosTab[]; activeTabId?: string };
        if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
          setTabs(parsed.tabs);
          setActiveTabId(parsed.activeTabId && parsed.tabs.some((t) => t.id === parsed.activeTabId) ? parsed.activeTabId : parsed.tabs[0].id);
        }
      }
    } catch {
      /* localStorage lỗi/parse hỏng — bỏ qua, giữ tab mặc định */
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
  }, [tabs, activeTabId, hydrated]);

  useEffect(() => {
    zaloAuthApi
      .me()
      .then((res) => {
        if (res.has_session && res.staff.full_name) setStaffName(res.staff.full_name);
      })
      .catch(() => undefined);
  }, []);

  function updateActiveTab(patch: Partial<PosTab> | ((t: PosTab) => Partial<PosTab>)) {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t))
    );
  }

  function addTab() {
    const t = newTab(nextTabLabel(tabs));
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  }

  function closeTab(id: string) {
    const tab = tabs.find((t) => t.id === id);
    if (tab && tab.cart.length > 0) {
      if (!confirm(`Đơn "${tab.label}" đang có ${tab.cart.length} sản phẩm chưa thanh toán. Đóng và bỏ đơn này?`)) return;
    }
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh = newTab("Đơn 1");
        if (activeTabId === id) setActiveTabId(fresh.id);
        return [fresh];
      }
      if (activeTabId === id) setActiveTabId(next[0].id);
      return next;
    });
  }

  function resetTab(id: string) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...newTab(t.label), id: t.id } : t)));
  }

  // ── Product search ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!productDropdownOpen) return;
    const t = setTimeout(() => {
      fetch(`/api/orders/search-products?q=${encodeURIComponent(productSearch)}&limit=12`)
        .then((r) => r.json())
        .then((d) => {
          setProductResults(Array.isArray(d?.products) ? d.products : []);
          setProductHighlight(0);
        })
        .catch(() => setProductResults([]));
    }, 220);
    return () => clearTimeout(t);
  }, [productSearch, productDropdownOpen]);

  const addProduct = useCallback(
    (p: PosProduct) => {
      updateActiveTab((tab) => {
        const existing = tab.cart.find((c) => c.product_id === p.id);
        if (existing) {
          return {
            cart: tab.cart.map((c) => (c.product_id === p.id ? { ...c, quantity: c.quantity + 1 } : c))
          };
        }
        const item: PosCartItem = {
          key: `${p.id}-${Math.random().toString(36).slice(2, 7)}`,
          product_id: p.id,
          product_name: p.name,
          product_sku: p.sku,
          unit: p.unit,
          image_url: p.image_url,
          price_cost: p.cost_price,
          price_wholesale: p.wholesale_price,
          price_retail: p.price,
          price_tier: "retail",
          custom_price: null,
          quantity: 1
        };
        return { cart: [...tab.cart, item] };
      });
      setProductSearch("");
      setProductResults([]);
      setProductDropdownOpen(false);
      setQuickPickerOpen(false);
      setTimeout(() => {
        const el = qtyInputRefs.current[p.id];
        el?.focus();
        el?.select();
      }, 0);
      void fetch("/api/orders/search-products/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: p.id })
      }).catch(() => undefined);
    },
    [activeTabId]
  );

  function updateQty(itemKey: string, qty: number) {
    if (qty <= 0) {
      updateActiveTab((tab) => ({ cart: tab.cart.filter((c) => c.key !== itemKey) }));
      return;
    }
    updateActiveTab((tab) => ({ cart: tab.cart.map((c) => (c.key === itemKey ? { ...c, quantity: qty } : c)) }));
  }

  function setTier(itemKey: string, tier: PriceTier) {
    updateActiveTab((tab) => ({
      cart: tab.cart.map((c) => (c.key === itemKey ? { ...c, price_tier: tier, custom_price: null } : c))
    }));
  }

  function setCustomPrice(itemKey: string, price: number | null) {
    updateActiveTab((tab) => ({ cart: tab.cart.map((c) => (c.key === itemKey ? { ...c, custom_price: price } : c)) }));
  }

  function removeItem(itemKey: string) {
    updateActiveTab((tab) => ({ cart: tab.cart.filter((c) => c.key !== itemKey) }));
  }

  function clearCart() {
    if (activeTab.cart.length === 0) return;
    if (!confirm("Xoá toàn bộ sản phẩm trong đơn này?")) return;
    updateActiveTab({ cart: [] });
  }

  // ── Customer search ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!customerDropdownOpen || activeTab.customer) return;
    const t = setTimeout(() => {
      fetch(`/api/orders/search-customers?q=${encodeURIComponent(customerSearch)}&limit=12`)
        .then((r) => r.json())
        .then((d) => {
          setCustomerResults(Array.isArray(d?.customers) ? d.customers : []);
          setCustomerHighlight(0);
        })
        .catch(() => setCustomerResults([]));
    }, 220);
    return () => clearTimeout(t);
  }, [customerSearch, customerDropdownOpen, activeTab.customer]);

  function pickCustomer(c: PosCustomer) {
    updateActiveTab({ customer: c });
    setCustomerSearch("");
    setCustomerResults([]);
    setCustomerDropdownOpen(false);
  }

  function clearCustomer() {
    updateActiveTab({ customer: null });
    setTimeout(() => customerInputRef.current?.focus(), 0);
  }

  // ── Totals ──────────────────────────────────────────────────────────────
  const subtotal = useMemo(
    () => activeTab.cart.reduce((s, c) => s + unitPrice(c) * c.quantity, 0),
    [activeTab.cart]
  );
  const shippingFee = activeTab.isShipping ? activeTab.shippingFee : 0;
  const discountType: DiscountType = activeTab.discountType ?? "amount";
  const discountAmount = orderDiscountAmount(subtotal, discountType, activeTab.discount);
  const total = Math.max(0, subtotal - discountAmount + shippingFee);
  const changeDue = Math.max(0, activeTab.amountReceived - total);

  // ── Quick picker (F10) — top sản phẩm hay bán, dùng lại ranking
  // use_count đã có sẵn ở /api/orders/search-products (q rỗng). ──────────
  function openQuickPicker() {
    setQuickPickerOpen((v) => {
      const next = !v;
      if (next && quickProducts.length === 0) {
        setQuickLoading(true);
        fetch(`/api/orders/search-products?q=&limit=12`)
          .then((r) => r.json())
          .then((d) => setQuickProducts(Array.isArray(d?.products) ? d.products : []))
          .catch(() => setQuickProducts([]))
          .finally(() => setQuickLoading(false));
      }
      return next;
    });
  }

  // ── Thanh toán — tái dùng nguyên createOrder() qua POST /api/orders,
  // KHÔNG viết luồng tạo đơn/trừ kho riêng cho POS. ───────────────────────
  async function handleCheckout() {
    if (activeTab.cart.length === 0) {
      setError("Đơn hàng chưa có sản phẩm nào.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const paidNow = activeTab.amountReceived >= total ? total : Math.max(0, activeTab.amountReceived);
      const paymentStatus = paidNow >= total && total > 0 ? "paid" : paidNow > 0 ? "partial" : "unpaid";

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: activeTab.customer?.id ?? null,
          customer_name: activeTab.customer?.name || "Khách lẻ",
          customer_phone: activeTab.customer?.phone || "",
          status: "completed",
          fulfillment_status: "shipped",
          payment_status: paymentStatus,
          payment_method: activeTab.paymentMethod,
          source: "pos",
          branch: BRANCH_NAME,
          staff: staffName,
          note: activeTab.note,
          discount: activeTab.discount,
          discount_type: discountType,
          shipping_fee: shippingFee,
          paid: paidNow,
          items: activeTab.cart.map((c) => ({
            product_id: c.product_id,
            product_name: c.product_name,
            product_sku: c.product_sku,
            unit: c.unit,
            image_url: c.image_url,
            quantity: c.quantity,
            unit_price: unitPrice(c)
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tạo được đơn hàng.");

      if (paidNow > 0) {
        // Ghi nhận thu tiền vào sổ quỹ — best-effort, không chặn luồng bán
        // hàng nếu lỗi (đơn đã tạo thành công là quan trọng nhất).
        void fetch("/api/cash-book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voucher_type: "receipt",
            payment_type: "order_payment",
            payment_category: "Bán hàng POS",
            person_name: activeTab.customer?.name || "Khách lẻ",
            reference_code: data.code,
            reference_type: "order",
            payment_method: PAYMENT_LABELS[activeTab.paymentMethod],
            amount: paidNow,
            branch: BRANCH_NAME,
            note: `Thu tiền đơn ${data.code} tại quầy POS`,
            status: "completed",
            created_by: staffName
          })
        }).catch(() => undefined);
      }

      setNotice({ text: `Đã thanh toán đơn ${data.code} — ${formatCurrencyVND(total)}.`, orderId: data.id });
      resetTab(activeTab.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi thanh toán.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Phím tắt toàn cục — dùng ref để luôn gọi bản mới nhất của các hàm mà
  // không phải khai báo lại listener mỗi lần state đổi. ───────────────────
  const actionsRef = useRef<{
    checkout: () => void;
    focusAmount: () => void;
    focusProduct: () => void;
    focusCustomer: () => void;
    focusDiscount: () => void;
    togglePaymentMenu: () => void;
    togglePicker: () => void;
    promoUnavailable: () => void;
  }>({
    checkout: () => undefined,
    focusAmount: () => undefined,
    focusProduct: () => undefined,
    focusCustomer: () => undefined,
    focusDiscount: () => undefined,
    togglePaymentMenu: () => undefined,
    togglePicker: () => undefined,
    promoUnavailable: () => undefined
  });
  actionsRef.current = {
    checkout: handleCheckout,
    focusAmount: () => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    },
    focusProduct: () => productInputRef.current?.focus(),
    focusCustomer: () => customerInputRef.current?.focus(),
    focusDiscount: () => {
      discountInputRef.current?.focus();
      discountInputRef.current?.select();
    },
    togglePaymentMenu: () => setPaymentMenuOpen((v) => !v),
    togglePicker: openQuickPicker,
    promoUnavailable: () => setNotice({ text: "Chương trình khuyến mại chưa được hỗ trợ." })
  };

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      switch (e.key) {
        case "F1":
          e.preventDefault();
          actionsRef.current.checkout();
          break;
        case "F2":
          e.preventDefault();
          actionsRef.current.focusAmount();
          break;
        case "F3":
        case "F9":
          e.preventDefault();
          actionsRef.current.focusProduct();
          break;
        case "F4":
          e.preventDefault();
          actionsRef.current.focusCustomer();
          break;
        case "F6":
          e.preventDefault();
          actionsRef.current.focusDiscount();
          break;
        case "F7":
          e.preventDefault();
          actionsRef.current.togglePaymentMenu();
          break;
        case "F8":
          e.preventDefault();
          actionsRef.current.promoUnavailable();
          break;
        case "F10":
          e.preventDefault();
          actionsRef.current.togglePicker();
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      document.exitFullscreen().catch(() => undefined);
    }
  }

  const productDismissRef = useDismiss(productDropdownOpen, () => setProductDropdownOpen(false));
  useEscape(productDropdownOpen, () => setProductDropdownOpen(false));
  const customerDismissRef = useDismiss(customerDropdownOpen, () => setCustomerDropdownOpen(false));
  useEscape(customerDropdownOpen, () => setCustomerDropdownOpen(false));
  const paymentMenuRef = useDismiss(paymentMenuOpen, () => setPaymentMenuOpen(false));

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6 bg-gray-100">
      {/* Header */}
      <header className="bg-[#0070c0] text-white flex items-center gap-4 px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-2 w-[42%]">
          <div className="relative flex-1" ref={productDismissRef}>
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              ref={productInputRef}
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                setProductDropdownOpen(true);
              }}
              onFocus={() => setProductDropdownOpen(true)}
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
                  setProductDropdownOpen(false);
                }
              }}
              placeholder="Thêm sản phẩm vào đơn (F3) — quét mã hoặc gõ tên/SKU"
              autoComplete="off"
              className="w-full pl-10 pr-4 py-1.5 rounded text-gray-900 focus:outline-none text-sm border-none"
            />
            {productDropdownOpen ? (
              <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border rounded shadow-xl max-h-80 overflow-auto text-gray-800">
                {productResults.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-gray-500">
                    {productSearch.trim() ? "Không tìm thấy sản phẩm nào." : "Gõ tên sản phẩm hoặc mã SKU để tìm."}
                  </div>
                ) : (
                  productResults.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addProduct(p);
                      }}
                      onMouseEnter={() => setProductHighlight(idx)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 border-b last:border-0 ${
                        idx === productHighlight ? "bg-blue-50" : "hover:bg-gray-50"
                      }`}
                    >
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-9 h-9 object-cover rounded border flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 bg-gray-100 rounded border flex items-center justify-center text-gray-300 flex-shrink-0">
                          <Package className="w-4 h-4" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{p.name}</div>
                        <div className="text-xs text-gray-500">
                          SKU: {p.sku || "—"} · {formatCurrencyVND(p.price)}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <button
            onClick={openQuickPicker}
            title="Chọn nhanh sản phẩm hay bán (F10)"
            className="bg-[#005ba1] hover:bg-[#004a85] p-1.5 rounded flex items-center gap-2 flex-shrink-0"
          >
            <LayoutGrid className="h-5 w-5" />
            <span className="font-medium text-sm">(F10)</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${quickPickerOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-1 overflow-x-auto min-w-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`px-3 py-1.5 rounded flex items-center gap-3 text-sm flex-shrink-0 ${
                tab.id === activeTabId ? "bg-white text-gray-800" : "bg-[#3d92d1] text-white hover:bg-[#2f83c2]"
              }`}
            >
              <span>
                {tab.label}
                {tab.cart.length > 0 ? ` (${tab.cart.length})` : ""}
              </span>
              {tabs.length > 1 ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className={`hover:text-red-500 ${tab.id === activeTabId ? "text-gray-400" : "text-white/70"}`}
                >
                  ×
                </span>
              ) : null}
            </button>
          ))}
          <button onClick={addTab} title="Tạo đơn mới" className="p-2 hover:bg-[#005ba1] rounded flex-shrink-0">
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-xs text-right">
            <div>{BRANCH_NAME}</div>
            <div className="flex items-center justify-end gap-1 truncate max-w-[10rem]">{staffName}</div>
          </div>
          <div className="flex gap-1">
            <button onClick={toggleFullscreen} title="Toàn màn hình" className="p-2 hover:bg-[#005ba1] rounded">
              <Maximize className="h-5 w-5" />
            </button>
            <button onClick={() => router.push("/")} title="Về trang chủ" className="p-2 hover:bg-[#005ba1] rounded">
              <Home className="h-5 w-5" />
            </button>
            <button onClick={() => setShortcutsOpen(true)} title="Trợ giúp / phím tắt" className="p-2 hover:bg-[#005ba1] rounded">
              <HelpCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {quickPickerOpen ? (
        <div className="bg-white border-b px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">Sản phẩm hay bán</span>
            <button onClick={() => setQuickPickerOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {quickLoading ? (
            <div className="py-6 flex justify-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : quickProducts.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-400">Chưa có dữ liệu sản phẩm.</div>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {quickProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="flex flex-col items-center gap-1 p-2 border rounded hover:bg-blue-50 hover:border-blue-300 text-center"
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="w-12 h-12 object-cover rounded border" />
                  ) : (
                    <div className="w-12 h-12 bg-gray-100 rounded border flex items-center justify-center text-gray-300">
                      <Package className="w-5 h-5" />
                    </div>
                  )}
                  <span className="text-[11px] text-gray-700 line-clamp-2 leading-tight">{p.name}</span>
                  <span className="text-[11px] font-medium text-blue-600">{formatCurrencyVND(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {notice ? (
        <div className="mx-4 mt-2 flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          <span>{notice.text}</span>
          <div className="flex items-center gap-3">
            {notice.orderId ? (
              <Link href={`/orders/${notice.orderId}`} target="_blank" className="underline font-medium">
                Xem đơn
              </Link>
            ) : null}
            <button onClick={() => setNotice(null)} className="underline">
              Đóng
            </button>
          </div>
        </div>
      ) : null}

      <main className="flex-1 flex overflow-hidden">
        {/* Product / cart area */}
        <section className="flex-1 bg-white flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            {activeTab.cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 py-16">
                <ShoppingBag className="w-16 h-16 mb-4 text-gray-200" />
                <p className="text-sm text-gray-500">Đơn hàng chưa có sản phẩm nào</p>
                <p className="text-xs text-gray-400 mt-1">Gõ tên, SKU hoặc quét mã ở ô tìm kiếm phía trên (F3)</p>
              </div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold">
                  <tr>
                    <th className="p-2 w-12 text-center">STT</th>
                    <th className="p-2 w-12"></th>
                    <th className="p-2 w-16 text-center">Ảnh SP</th>
                    <th className="p-2 w-24">Mã SKU</th>
                    <th className="p-2">Tên sản phẩm</th>
                    <th className="p-2 w-20 text-right">Đơn vị</th>
                    <th className="p-2 w-28 text-center">Số lượng</th>
                    <th className="p-2 w-40 text-right">Đơn giá</th>
                    <th className="p-2 w-32 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTab.cart.map((c, idx) => (
                    <tr key={c.key} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                      <td className="p-2 text-center">{idx + 1}</td>
                      <td className="p-2 text-center">
                        <button onClick={() => removeItem(c.key)} className="text-gray-400 hover:text-red-500">
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                      <td className="p-2 flex justify-center">
                        {c.image_url ? (
                          <img alt="" className="h-10 w-10 object-contain border rounded p-0.5" src={c.image_url} />
                        ) : (
                          <div className="h-10 w-10 border rounded flex items-center justify-center text-gray-300">
                            <Package className="w-5 h-5" />
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-blue-600">{c.product_sku || "—"}</td>
                      <td className="p-2">
                        <div className="font-medium">{c.product_name}</div>
                      </td>
                      <td className="p-2 text-right">{c.unit || "—"}</td>
                      <td className="p-2">
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => updateQty(c.key, c.quantity - 1)}
                            className="px-2 py-1 border rounded-l bg-gray-50 hover:bg-gray-100"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            ref={(el) => {
                              qtyInputRefs.current[c.product_id] = el;
                            }}
                            type="text"
                            value={c.quantity}
                            onChange={(e) => updateQty(c.key, Math.max(0, Math.round(parseNum(e.target.value))))}
                            onFocus={(e) => e.target.select()}
                            className="w-10 border-t border-b text-center py-0.5 text-sm focus:outline-none"
                          />
                          <button
                            onClick={() => updateQty(c.key, c.quantity + 1)}
                            className="px-2 py-1 border rounded-r bg-gray-50 hover:bg-gray-100"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        {priceEditMode ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="text"
                              value={unitPrice(c) || ""}
                              onChange={(e) => setCustomPrice(c.key, parseNum(e.target.value))}
                              className="w-24 border rounded text-right text-sm py-1 px-1.5"
                            />
                            {c.custom_price !== null ? (
                              <button
                                title="Về giá theo loại (vốn/sĩ/lẻ)"
                                onClick={() => setCustomPrice(c.key, null)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-medium">{formatCurrencyVND(unitPrice(c))}</span>
                            <div className="inline-flex gap-0.5" role="group" aria-label="Chọn loại giá">
                              {(["cost", "wholesale", "retail"] as PriceTier[]).map((tier) => (
                                <button
                                  key={tier}
                                  type="button"
                                  onClick={() => setTier(c.key, tier)}
                                  title={TIER_LABELS[tier]}
                                  className={`px-1 py-0.5 rounded text-[9px] font-semibold ${
                                    c.custom_price === null && c.price_tier === tier
                                      ? "bg-[#0070c0] text-white"
                                      : "bg-blue-50 text-[#0070c0] hover:bg-blue-100"
                                  }`}
                                >
                                  {tier === "cost" ? "Vốn" : tier === "wholesale" ? "Sĩ" : "Lẻ"}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-right font-medium">{formatCurrencyVND(unitPrice(c) * c.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t border-gray-200 px-4 py-2 flex-shrink-0">
            <button
              onClick={() => setNoteOpen((v) => !v)}
              className="flex items-center text-gray-400 gap-2 hover:text-gray-600"
            >
              <StickyNote className="h-4 w-4" />
              <span className="text-xs">Nhập ghi chú đơn hàng</span>
            </button>
            {noteOpen ? (
              <textarea
                value={activeTab.note}
                onChange={(e) => updateActiveTab({ note: e.target.value })}
                placeholder="Ghi chú cho đơn hàng này..."
                className="w-full mt-2 p-2 border border-gray-300 rounded text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none h-16 resize-none"
              />
            ) : null}
          </div>

          {/* Quick actions */}
          <div className="border-t border-gray-200 flex-shrink-0">
            <div className="flex items-center justify-center py-2">
              <button
                onClick={() => setQuickActionsCollapsed((v) => !v)}
                className="h-1 w-8 bg-gray-200 rounded-full hover:bg-gray-300"
                title={quickActionsCollapsed ? "Mở thao tác nhanh" : "Thu gọn thao tác nhanh"}
              />
            </div>
            {!quickActionsCollapsed ? (
              <div className="grid grid-cols-6 gap-3 px-4 pb-4">
                <QuickActionButton label="Thêm dịch vụ (F9)" onClick={() => productInputRef.current?.focus()} />
                <QuickActionButton label="Chiết khấu đơn (F6)" onClick={() => actionsRef.current.focusDiscount()} />
                <QuickActionButton label="Khuyến mại (F8)" disabled title="Chưa hỗ trợ — chưa có hệ thống khuyến mại" />
                <QuickActionButton label="Đổi quà" disabled title="Chưa hỗ trợ — chưa có hệ thống điểm thưởng" />
                <QuickActionButton label="Thiết lập chung" disabled title="Chưa hỗ trợ" />
                <QuickActionButton
                  label={priceEditMode ? "Đang đổi giá bán" : "Đổi giá bán hàng"}
                  active={priceEditMode}
                  onClick={() => setPriceEditMode((v) => !v)}
                />
                <QuickActionButton
                  label="Thông tin khách hàng"
                  disabled={!activeTab.customer}
                  title={!activeTab.customer ? "Chọn khách hàng trước" : undefined}
                  onClick={() => setCustomerInfoOpen(true)}
                />
                <QuickActionButton label="Xóa toàn bộ sản phẩm" onClick={clearCart} disabled={activeTab.cart.length === 0} />
                <QuickActionButton label="Đổi trả hàng" disabled title="Chưa hỗ trợ — xử lý đổi trả trong trang Đơn hàng" />
                <Link
                  href="/orders"
                  target="_blank"
                  className="bg-[#ebf5ff] text-gray-700 py-3 rounded border border-[#d6eaff] hover:bg-[#d6eaff] transition-colors font-medium text-center text-sm"
                >
                  Xem danh sách đơn hàng
                </Link>
                <Link
                  href="/reports/sales"
                  target="_blank"
                  className="bg-[#ebf5ff] text-gray-700 py-3 rounded border border-[#d6eaff] hover:bg-[#d6eaff] transition-colors font-medium text-center text-sm"
                >
                  Xem báo cáo
                </Link>
                <QuickActionButton label="Tất cả thao tác" onClick={() => setShortcutsOpen(true)} />
              </div>
            ) : null}
          </div>
        </section>

        {/* Sidebar */}
        <aside className="w-[380px] border-l border-gray-200 bg-white flex flex-col p-4 overflow-y-auto flex-shrink-0">
          <div className="relative mb-4" ref={customerDismissRef}>
            {activeTab.customer ? (
              <div className="flex items-center justify-between gap-2 border-b border-gray-200 pb-2">
                <button
                  onClick={() => setCustomerInfoOpen(true)}
                  className="flex-1 text-left min-w-0"
                  title="Xem thông tin khách hàng"
                >
                  <div className="text-sm font-semibold text-gray-800 truncate">{activeTab.customer.name}</div>
                  <div className="text-xs text-gray-500 truncate">{activeTab.customer.phone || activeTab.customer.code || "—"}</div>
                </button>
                <button onClick={clearCustomer} title="Bỏ chọn khách hàng" className="text-gray-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                  <Search className="h-4 w-4" />
                </span>
                <input
                  ref={customerInputRef}
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  onFocus={() => setCustomerDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setCustomerHighlight((h) => Math.min(customerResults.length - 1, h + 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setCustomerHighlight((h) => Math.max(0, h - 1));
                    } else if (e.key === "Enter" && customerResults.length > 0) {
                      e.preventDefault();
                      pickCustomer(customerResults[customerHighlight]);
                    } else if (e.key === "Escape") {
                      setCustomerDropdownOpen(false);
                    }
                  }}
                  placeholder="Thêm khách hàng vào đơn (F4)"
                  autoComplete="off"
                  className="w-full pl-10 pr-10 py-2 border-b border-gray-200 focus:outline-none focus:border-blue-500 text-sm"
                />
                <Link
                  href="/customers"
                  target="_blank"
                  title="Thêm khách hàng mới"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-blue-600"
                >
                  <UserPlus className="h-5 w-5" />
                </Link>
                {customerDropdownOpen ? (
                  <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border rounded shadow-xl max-h-64 overflow-auto">
                    {customerResults.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-gray-500">Không tìm thấy khách hàng.</div>
                    ) : (
                      customerResults.map((c, idx) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            pickCustomer(c);
                          }}
                          onMouseEnter={() => setCustomerHighlight(idx)}
                          className={`w-full text-left px-3 py-2 border-b last:border-0 ${
                            idx === customerHighlight ? "bg-blue-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <div className="text-sm font-medium text-gray-800">{c.name}</div>
                          <div className="text-xs text-gray-500">{c.phone || c.code || c.email || "—"}</div>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <input
              id="shipping"
              type="checkbox"
              checked={activeTab.isShipping}
              onChange={(e) => updateActiveTab({ isShipping: e.target.checked })}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="shipping" className="text-sm font-medium">
              Giao hàng
            </label>
          </div>
          {activeTab.isShipping ? (
            <div className="flex justify-between items-center text-gray-600 mb-4">
              <span className="text-sm">Phí giao hàng</span>
              <input
                type="text"
                value={activeTab.shippingFee || ""}
                onChange={(e) => updateActiveTab({ shippingFee: parseNum(e.target.value) })}
                className="w-24 border-b border-gray-200 text-right text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          ) : (
            <div className="mb-2" />
          )}

          <div className="space-y-4 mb-auto">
            <div className="flex justify-between items-center text-gray-600">
              <span>
                Tổng tiền: <span className="font-bold text-black">({activeTab.cart.length})</span> sản phẩm
              </span>
              <span className="font-medium text-black">{formatCurrencyVND(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <span title="Hệ thống chưa hỗ trợ cấu hình thuế VAT">VAT (0%)</span>
              <span className="font-medium text-black">0</span>
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <span>Chiết khấu (F6)</span>
              <div className="inline-flex items-center gap-1 justify-end">
                <input
                  ref={discountInputRef}
                  type="text"
                  value={activeTab.discount || ""}
                  onChange={(e) => updateActiveTab({ discount: parseNum(e.target.value) })}
                  onFocus={(e) => e.target.select()}
                  className="w-20 border-b border-gray-200 text-right focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => updateActiveTab({ discountType: discountType === "percent" ? "amount" : "percent" })}
                  title="Đổi đơn vị chiết khấu (số tiền / phần trăm)"
                  className="w-7 shrink-0 px-1.5 py-1 rounded text-[10px] font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  {discountType === "percent" ? "%" : "đ"}
                </button>
              </div>
            </div>
            {discountAmount > 0 ? (
              <div className="flex justify-between items-center text-gray-600">
                <span>Giảm giá</span>
                <span className="font-medium text-red-600">-{formatCurrencyVND(discountAmount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between items-center font-bold text-lg pt-4 border-t border-gray-100">
              <span className="text-blue-700 uppercase">Khách phải trả</span>
              <span className="text-blue-700">{formatCurrencyVND(total)}</span>
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <div className="flex flex-col">
                <span className="font-medium text-black">Tiền khách đưa (F2)</span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPaymentMenuOpen((v) => !v)}
                    className="flex items-center text-xs text-blue-500 gap-1 italic cursor-pointer"
                  >
                    {PAYMENT_LABELS[activeTab.paymentMethod]} (F7) <ChevronDown className="h-3 w-3" />
                  </button>
                  {paymentMenuOpen ? (
                    <div ref={paymentMenuRef} className="absolute z-30 top-full mt-1 bg-white border rounded shadow-lg w-40">
                      {(["cash", "bank_transfer", "card"] as PaymentMethod[]).map((pm) => (
                        <button
                          key={pm}
                          onClick={() => {
                            updateActiveTab({ paymentMethod: pm });
                            setPaymentMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 text-left px-3 py-2 text-xs hover:bg-blue-50 ${
                            activeTab.paymentMethod === pm ? "text-blue-600 font-semibold" : "text-gray-700"
                          }`}
                        >
                          {pm === "cash" ? <Banknote className="w-3.5 h-3.5" /> : pm === "bank_transfer" ? <Wallet className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
                          {PAYMENT_LABELS[pm]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <input
                ref={amountInputRef}
                type="text"
                value={activeTab.amountReceived || ""}
                onChange={(e) => updateActiveTab({ amountReceived: parseNum(e.target.value) })}
                onFocus={(e) => e.target.select()}
                className="w-32 border-b border-gray-200 text-right text-lg font-bold focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <span className="font-medium text-black">Tiền thừa trả khách</span>
              <span className="font-bold text-lg">{formatCurrencyVND(changeDue)}</span>
            </div>
          </div>

          {error ? (
            <div className="mt-4 bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-700">{error}</div>
          ) : null}

          <div className="mt-8">
            <div className="flex gap-2">
              <button
                onClick={() => setPaymentMenuOpen((v) => !v)}
                className="flex-1 bg-gray-100 py-3 rounded font-medium text-gray-700 hover:bg-gray-200 leading-tight text-sm"
              >
                Đổi hình thức thanh toán (F7)
              </button>
              <button
                onClick={handleCheckout}
                disabled={submitting || activeTab.cart.length === 0}
                className="flex-[2] bg-[#0070c0] text-white py-3 rounded font-bold text-xl uppercase hover:bg-[#005ba1] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Thanh toán (F1)
              </button>
            </div>
          </div>
        </aside>
      </main>

      {shortcutsOpen ? <ShortcutsModal onClose={() => setShortcutsOpen(false)} /> : null}
      {customerInfoOpen && activeTab.customer ? (
        <CustomerInfoModal customerId={activeTab.customer.id} onClose={() => setCustomerInfoOpen(false)} />
      ) : null}
    </div>
  );
}

function QuickActionButton({
  label,
  onClick,
  disabled,
  active,
  title
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`py-3 rounded border transition-colors font-medium text-sm ${
        active
          ? "bg-[#0070c0] border-[#0070c0] text-white"
          : disabled
            ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
            : "bg-[#ebf5ff] text-gray-700 border-[#d6eaff] hover:bg-[#d6eaff]"
      }`}
    >
      {label}
    </button>
  );
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts: Array<[string, string]> = [
    ["F1", "Thanh toán"],
    ["F2", "Focus vào ô Tiền khách đưa"],
    ["F3", "Focus vào ô tìm sản phẩm"],
    ["F4", "Focus vào ô tìm khách hàng"],
    ["F6", "Focus vào ô Chiết khấu đơn"],
    ["F7", "Mở/đóng chọn hình thức thanh toán"],
    ["F8", "Khuyến mại (chưa hỗ trợ)"],
    ["F9", "Thêm dịch vụ (dùng chung ô tìm sản phẩm)"],
    ["F10", "Chọn nhanh sản phẩm hay bán"]
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold text-slate-800">Phím tắt</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-2 text-sm">
          {shortcuts.map(([key, label]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="bg-slate-100 border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-slate-600 w-10 text-center">
                {key}
              </span>
              <span className="text-slate-700">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface CustomerDetail {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  total_spent: number;
  total_orders: number;
  total_debt: number;
  last_order_at: string | null;
  group_name?: string;
}

function CustomerInfoModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/customers/${customerId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setCustomer(d);
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được thông tin khách hàng.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold text-slate-800">Thông tin khách hàng</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 text-sm space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
            </div>
          ) : error || !customer ? (
            <div className="text-red-600">{error || "Không tìm thấy khách hàng."}</div>
          ) : (
            <>
              <InfoRow label="Tên" value={customer.name} />
              <InfoRow label="Mã KH" value={customer.code} />
              <InfoRow label="Điện thoại" value={customer.phone} />
              <InfoRow label="Email" value={customer.email} />
              <InfoRow label="Nhóm khách" value={customer.group_name || "—"} />
              <InfoRow label="Tổng đã mua" value={formatCurrencyVND(customer.total_spent)} />
              <InfoRow label="Số đơn đã mua" value={String(customer.total_orders)} />
              <InfoRow label="Nợ hiện tại" value={formatCurrencyVND(customer.total_debt)} />
              <div className="pt-2">
                <Link href={`/customers`} target="_blank" className="text-blue-600 text-xs hover:underline">
                  Xem đầy đủ hồ sơ khách hàng →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium text-right">{value || "—"}</span>
    </div>
  );
}
