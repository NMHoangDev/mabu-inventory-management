"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Printer,
  Edit2,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  ReceiptText,
  Package,
  User,
  MapPin,
  Phone,
  Mail,
  Info,
  StickyNote,
  Banknote,
  CreditCard,
  Wallet,
  ChevronRight,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";
import { PrintableInvoice } from "@/components/orders/PrintableInvoice";
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { PageGuard } from "@/components/auth/PageGuard";

interface OrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_type: "amount" | "percent";
  discount_value: number;
  line_total: number;
  image_url?: string;
  note?: string;
}

// Chiết khấu TỪNG SẢN PHẨM (khác chiết khấu tổng đơn order.discount) — mirror
// lineItemDiscountAmount ở lib/orders/repository.ts (không import trực tiếp
// vì repository.ts dùng `pg`, không bundle được cho client component).
function itemDiscountAmount(item: OrderItem): number {
  const base = item.quantity * item.unit_price;
  const raw = item.discount_type === "percent" ? (base * item.discount_value) / 100 : item.discount_value;
  return Math.min(base, Math.max(0, raw));
}

interface Order {
  id: string;
  code: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_address?: string;
  status: "new" | "processing" | "completed" | "cancelled";
  payment_status: "unpaid" | "partial" | "paid" | "refunded";
  fulfillment_status: "unshipped" | "confirmed" | "packing" | "shipping" | "shipped" | "returned";
  payment_method: "cod" | "bank_transfer" | "card" | "cash";
  source: string;
  branch: string;
  staff: string;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  paid: number;
  items: OrderItem[];
  note?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  new: "Mới",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  cancelled: "Huỷ bỏ",
};
const STATUS_CLASS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 border border-blue-200",
  processing: "bg-blue-100 text-blue-700 border border-blue-200",
  completed: "bg-green-100 text-green-700 border border-green-200",
  cancelled: "bg-red-100 text-red-700 border border-red-200",
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  new: <Clock className="w-4 h-4" />,
  processing: <RefreshCw className="w-4 h-4 animate-spin" />,
  completed: <CheckCircle className="w-4 h-4" />,
  cancelled: <XCircle className="w-4 h-4" />,
};

const PAY_LABEL: Record<string, string> = {
  unpaid: "Chưa thanh toán",
  partial: "Thanh toán một phần",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
};
const PAY_CLASS: Record<string, string> = {
  unpaid: "bg-orange-100 text-orange-700 border border-orange-200",
  partial: "bg-blue-100 text-blue-700 border border-blue-200",
  paid: "bg-green-100 text-green-700 border border-green-200",
  refunded: "bg-gray-100 text-gray-500 border border-gray-200",
};

const SHIP_LABEL: Record<string, string> = {
  unshipped: "Chưa xử lý",
  confirmed: "Đã xác nhận",
  packing: "Đang đóng gói",
  shipping: "Đang giao",
  shipped: "Đã giao",
  returned: "Hoàn trả",
};
const SHIP_CLASS: Record<string, string> = {
  unshipped: "bg-gray-100 text-gray-600 border border-gray-200",
  confirmed: "bg-blue-100 text-blue-700 border border-blue-200",
  packing: "bg-purple-100 text-purple-700 border border-purple-200",
  shipping: "bg-orange-100 text-orange-700 border border-orange-200",
  shipped: "bg-green-100 text-green-700 border border-green-200",
  returned: "bg-red-100 text-red-700 border border-red-200",
};
const SHIP_ICON: Record<string, React.ReactNode> = {
  unshipped: <Package className="w-4 h-4" />,
  confirmed: <CheckCircle className="w-4 h-4" />,
  packing: <Package className="w-4 h-4" />,
  shipping: <Truck className="w-4 h-4" />,
  shipped: <CheckCircle className="w-4 h-4" />,
  returned: <RefreshCw className="w-4 h-4" />,
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cod: "Thanh toán khi nhận hàng (COD)",
  bank_transfer: "Chuyển khoản",
  card: "Quẹt thẻ",
  cash: "Tiền mặt",
};

// Bước kế tiếp hợp lệ cho từng fulfillment_status — mirror
// FULFILLMENT_TRANSITIONS ở lib/orders/repository.ts. "unshipped" chỉ hiện
// nút này khi order.status đã "completed" (đơn tạo trực tiếp ở trạng thái
// hoàn tất, không qua bước "Xác nhận đơn hàng" riêng — xem confirmOrderNow).
//
// "returned" đã bị BỎ khỏi map này (trước đây advanceFulfillment("returned")
// chỉ đổi cờ, KHÔNG hoàn kho/hoàn tiền/ghi nhận SL trả — xem module
// lib/order-returns/repository.ts). Nút "Đổi trả hàng" giờ điều hướng sang
// /orders/returns/new/<id> (form trả hàng thật), fulfillment_status chỉ được
// createOrderReturn() tự đổi sang 'returned' khi mọi dòng đã trả hết.
const NEXT_FULFILLMENT: Record<string, { key: string; label: string; danger?: boolean }[]> = {
  unshipped: [{ key: "confirmed", label: "Xác nhận xử lý" }],
  confirmed: [{ key: "packing", label: "Đóng gói" }],
  packing: [{ key: "shipping", label: "Bắt đầu giao hàng" }],
  shipping: [{ key: "shipped", label: "Đã giao thành công" }],
  shipped: [],
  returned: [],
};

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}
function initials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}
function avatarColor(name: string) {
  const palette = [
    "bg-blue-100 text-blue-700",
    "bg-purple-100 text-purple-700",
    "bg-yellow-100 text-yellow-700",
    "bg-red-100 text-red-700",
    "bg-emerald-100 text-emerald-700",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const { hasPermission } = usePermissions();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"info" | "timeline">("info");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  // Thông tin shop để in ở header hoá đơn — tái dùng cấu hình storefront sẵn
  // có (store_name/contact_phone/contact_address), không tạo cấu hình riêng.
  const [store, setStore] = useState({ name: "Cửa hàng", phone: "", address: "" });

  useEffect(() => {
    fetch("/api/settings/storefront")
      .then((res) => res.json())
      .then((data) => {
        const s = data?.settings;
        if (s) setStore({ name: s.store_name || "Cửa hàng", phone: s.contact_phone || "", address: s.contact_address || "" });
      })
      .catch(() => undefined);
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Không tìm thấy đơn hàng.");
        throw new Error("Không thể tải đơn hàng.");
      }
      const data = await res.json();
      setOrder(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (orderId) fetchOrder();
  }, [orderId, fetchOrder]);

  // Trước đây 3 nút này không gắn onClick nào cả — API (payment/status/xoá)
  // đã có sẵn và dùng ở nơi khác (orders/new, orders/[id]/edit) nhưng chưa
  // hề được gọi từ chính trang chi tiết đơn hàng.
  const markPaidNow = async () => {
    if (!order || busy) return;
    if (!window.confirm(`Xác nhận đã nhận đủ ${formatCurrencyVND(order.total - order.paid)} còn lại từ khách?`)) return;
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: order.total, payment_status: "paid" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Không cập nhật được thanh toán.");
      }
      await fetchOrder();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Lỗi không xác định.");
    } finally {
      setBusy(false);
    }
  };

  const confirmOrderNow = async () => {
    if (!order || busy) return;
    if (!window.confirm("Xác nhận đơn hàng? Tồn kho sẽ được trừ ngay.")) return;
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/orders/${orderId}/confirm`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không xác nhận được đơn hàng.");
      await fetchOrder();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Lỗi không xác định.");
    } finally {
      setBusy(false);
    }
  };

  const advanceFulfillment = async (nextStatus: string) => {
    if (!order || busy) return;
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next_status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không cập nhật được trạng thái xử lý.");
      await fetchOrder();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Lỗi không xác định.");
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    if (!order || busy) return;
    if (!window.confirm("Huỷ đơn hàng này? Nếu đơn đã hoàn tất, tồn kho đã trừ sẽ được hoàn lại.")) return;
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Không huỷ được đơn hàng.");
      }
      await fetchOrder();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Lỗi không xác định.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#f4f6f8]">
        <header className="h-14 bg-white border-b border-[#c0c6d6] flex items-center px-6 shrink-0 sticky top-0 z-20">
          <Link href="/orders" className="flex items-center text-[#005baf] hover:bg-[#ebf5ff] p-2 rounded transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="ml-3 text-lg font-bold text-[#0d1d29]">Chi tiết đơn hàng</span>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-[#404754]">
            <div className="animate-spin h-5 w-5 border-2 border-[#005baf] border-t-transparent rounded-full" />
            Đang tải...
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col min-h-screen bg-[#f4f6f8]">
        <header className="h-14 bg-white border-b border-[#c0c6d6] flex items-center px-6 shrink-0 sticky top-0 z-20">
          <Link href="/orders" className="flex items-center text-[#005baf] hover:bg-[#ebf5ff] p-2 rounded transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="ml-3 text-lg font-bold text-[#0d1d29]">Chi tiết đơn hàng</span>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8 bg-white rounded-xl border border-[#c0c6d6] shadow-sm max-w-sm">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="font-semibold text-[#0d1d29] mb-2">{error || "Không tìm thấy đơn hàng."}</p>
            <Link href="/orders" className="inline-flex items-center gap-1 text-[#005baf] text-sm hover:underline">
              <ChevronRight className="w-4 h-4" />
              Quay về danh sách đơn hàng
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, order.total - order.paid);
  const itemDiscountTotal = order.items.reduce((s, item) => s + itemDiscountAmount(item), 0);

  return (
    <PageGuard permission="orders.view">
    <div className="flex flex-col min-h-screen bg-[#f4f6f8]">
      {/* Top bar */}
      <header className="h-14 bg-white border-b border-[#c0c6d6] flex justify-between items-center px-6 shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/orders" className="flex items-center text-[#005baf] hover:bg-[#ebf5ff] p-2 rounded transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-[#0d1d29]">#{order.code}</h2>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${STATUS_CLASS[order.status]}`}>
              {STATUS_ICON[order.status]}
              {STATUS_LABEL[order.status]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="p-2 hover:bg-[#ebf5ff] rounded transition-colors"
            title="In đơn hàng"
          >
            <Printer className="w-5 h-5 text-[#404754]" />
          </button>
          {hasPermission("orders.edit") ? (
            <button
              onClick={() => router.push(`/orders/${orderId}/edit`)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#005baf] hover:bg-[#005eb3] text-white text-sm font-medium rounded transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Sửa đơn
            </button>
          ) : null}
          <div className="flex items-center gap-2 pl-3 border-l border-[#c0c6d6]">
            <span className="text-xs text-[#0d1d29] font-medium">{order.staff}</span>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${avatarColor(order.staff)}`}>
              {initials(order.staff)}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-6 space-y-4">
        {/* Status badges row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${PAY_CLASS[order.payment_status]}`}>
            <CreditCard className="w-3.5 h-3.5" />
            {PAY_LABEL[order.payment_status]}
          </div>
          <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${SHIP_CLASS[order.fulfillment_status]}`}>
            {SHIP_ICON[order.fulfillment_status]}
            {SHIP_LABEL[order.fulfillment_status]}
          </div>
          <span className="text-xs text-[#404754] bg-white border border-[#c0c6d6] px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" />
            {order.source}
          </span>
          <span className="text-xs text-[#404754] bg-white border border-[#c0c6d6] px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" />
            {PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method}
          </span>
          <span className="text-xs text-[#404754] bg-white border border-[#c0c6d6] px-3 py-1.5 rounded-lg">
            {order.branch}
          </span>
          <span className="text-xs text-[#404754] bg-white border border-[#c0c6d6] px-3 py-1.5 rounded-lg">
            {fmtDate(order.created_at)}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Order items */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <section className="bg-white border border-[#c0c6d6] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#c0c6d6] bg-[#ebf5ff] flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#0d1d29]">Danh sách sản phẩm ({order.items.length})</h3>
                <span className="text-xs text-[#404754]">{order.items.reduce((s, i) => s + i.quantity, 0)} sản phẩm</span>
              </div>
              <div className="divide-y divide-[#c0c6d6]">
                {order.items.map((item) => (
                  <div key={item.id} className="p-4 flex items-center gap-4 hover:bg-[#f6f9ff] transition-colors">
                    <div className="w-12 h-12 rounded border border-[#c0c6d6] bg-white overflow-hidden flex-shrink-0">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[#ebf5ff] flex items-center justify-center text-[#c0c6d6]">
                          <ReceiptText className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0d1d29]">{item.product_name}</p>
                      <p className="text-xs text-[#404754]">SKU: {item.product_sku || "—"} · {item.unit}</p>
                      {item.note ? (
                        <p className="text-xs text-[#404754] italic mt-0.5">Ghi chú: {item.note}</p>
                      ) : null}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-[#0d1d29]">{formatCurrencyVND(item.unit_price)}</p>
                      <p className="text-xs text-[#404754]">× {item.quantity}</p>
                      {itemDiscountAmount(item) > 0 && (
                        <p className="text-xs text-green-600">
                          -{item.discount_type === "percent" ? `${item.discount_value}%` : formatCurrencyVND(item.discount_value)}
                        </p>
                      )}
                    </div>
                    <div className="text-right w-28 shrink-0">
                      <p className="text-sm font-bold text-[#005baf]">{formatCurrencyVND(item.line_total)}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Totals */}
              <div className="border-t border-[#c0c6d6] p-4 space-y-2 bg-[#fafbfc]">
                <div className="flex justify-between text-sm text-[#404754]">
                  <span>Tổng tiền sản phẩm</span>
                  <span>{formatCurrencyVND(order.subtotal)}</span>
                </div>
                {itemDiscountTotal > 0 && (
                  <div className="flex justify-between text-sm text-[#404754]">
                    <span>Chiết khấu sản phẩm</span>
                    <span className="text-green-600">-{formatCurrencyVND(itemDiscountTotal)}</span>
                  </div>
                )}
                {order.discount > 0 && (
                  <div className="flex justify-between text-sm text-[#404754]">
                    <span>Chiết khấu đơn</span>
                    <span className="text-green-600">-{formatCurrencyVND(order.discount)}</span>
                  </div>
                )}
                {order.shipping_fee > 0 && (
                  <div className="flex justify-between text-sm text-[#404754]">
                    <span>Phí giao hàng</span>
                    <span>+{formatCurrencyVND(order.shipping_fee)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-dashed border-[#c0c6d6]">
                  <span className="text-base font-bold text-[#0d1d29]">Khách phải trả</span>
                  <span className="text-base font-bold text-[#005baf]">{formatCurrencyVND(order.total)}</span>
                </div>
              </div>
            </section>

            {/* Note */}
            {order.note && (
              <section className="bg-white border border-[#c0c6d6] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <StickyNote className="w-4 h-4 text-[#404754]" />
                  <h3 className="text-sm font-semibold text-[#0d1d29]">Ghi chú</h3>
                </div>
                <p className="text-sm text-[#404754] whitespace-pre-wrap">{order.note}</p>
              </section>
            )}

            {/* Timeline / Activity tab */}
            <section className="bg-white border border-[#c0c6d6] rounded-xl overflow-hidden">
              <div className="flex border-b border-[#c0c6d6]">
                <button
                  onClick={() => setActiveTab("info")}
                  className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === "info"
                      ? "text-[#005baf] border-[#005baf]"
                      : "text-[#404754] border-transparent hover:text-[#0d1d29]"
                  }`}
                >
                  Thông tin bổ sung
                </button>
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === "timeline"
                      ? "text-[#005baf] border-[#005baf]"
                      : "text-[#404754] border-transparent hover:text-[#0d1d29]"
                  }`}
                >
                  Lịch sử hoạt động
                </button>
              </div>
              <div className="p-4">
                {activeTab === "info" ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex gap-2">
                      <Info className="w-4 h-4 text-[#404754] mt-0.5 shrink-0" />
                      <div>
                        <span className="text-[#404754]">Nguồn đơn: </span>
                        <span className="text-[#0d1d29] font-medium">{order.source}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Package className="w-4 h-4 text-[#404754] mt-0.5 shrink-0" />
                      <div>
                        <span className="text-[#404754]">Chi nhánh: </span>
                        <span className="text-[#0d1d29] font-medium">{order.branch}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Clock className="w-4 h-4 text-[#404754] mt-0.5 shrink-0" />
                      <div>
                        <span className="text-[#404754]">Ngày tạo: </span>
                        <span className="text-[#0d1d29] font-medium">{fmtDate(order.created_at)}</span>
                      </div>
                    </div>
                    {order.updated_at !== order.created_at && (
                      <div className="flex gap-2">
                        <RefreshCw className="w-4 h-4 text-[#404754] mt-0.5 shrink-0" />
                        <div>
                          <span className="text-[#404754]">Cập nhật lần cuối: </span>
                          <span className="text-[#0d1d29] font-medium">{fmtDate(order.updated_at)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <TimelineItem
                      icon={<Clock className="w-3.5 h-3.5" />}
                      time={order.created_at}
                      text={`Đơn hàng được tạo bởi ${order.staff}`}
                      color="text-blue-600 bg-blue-100"
                    />
                    {order.status !== "new" && (
                      <TimelineItem
                        icon={<RefreshCw className="w-3.5 h-3.5" />}
                        time={order.updated_at}
                        text={`Đơn hàng chuyển sang trạng thái "${STATUS_LABEL[order.status]}"`}
                        color="text-orange-600 bg-orange-100"
                      />
                    )}
                    {order.payment_status === "paid" && (
                      <TimelineItem
                        icon={<CheckCircle className="w-3.5 h-3.5" />}
                        time={order.updated_at}
                        text={`Thanh toán thành công: ${formatCurrencyVND(order.paid)}`}
                        color="text-green-600 bg-green-100"
                      />
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Right: Summary + Customer */}
          <div className="flex flex-col gap-4">
            {/* Payment summary */}
            <section className="bg-white border border-[#c0c6d6] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-[#0d1d29]">Thanh toán</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#404754]">Tổng tiền</span>
                  <span className="font-medium">{formatCurrencyVND(order.total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#404754]">Đã thanh toán</span>
                  <span className="font-medium text-green-600">{formatCurrencyVND(order.paid)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-dashed border-[#c0c6d6] pt-2">
                  <span className="text-[#404754] font-semibold">Còn lại</span>
                  <span className="font-bold text-red-600">{formatCurrencyVND(remaining)}</span>
                </div>
              </div>
              {actionError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{actionError}</div>
              )}
              {order.payment_status !== "paid" && (
                <button
                  onClick={markPaidNow}
                  disabled={busy}
                  className="w-full bg-[#005baf] hover:bg-[#005eb3] text-white py-2 rounded font-bold text-sm transition-colors disabled:opacity-50"
                >
                  {busy ? "Đang xử lý..." : "Thanh toán ngay"}
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="w-full border border-[#c0c6d6] text-[#404754] hover:bg-[#ebf5ff] py-2 rounded text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Printer className="w-4 h-4" />
                In hóa đơn
              </button>
            </section>

            {/* Customer info */}
            <section className="bg-white border border-[#c0c6d6] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-[#404754]" />
                <h3 className="text-sm font-bold text-[#0d1d29]">Khách hàng</h3>
              </div>
              {order.customer_id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${avatarColor(order.customer_name)}`}>
                      {initials(order.customer_name)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#0d1d29]">{order.customer_name}</p>
                      <p className="text-xs text-[#404754]">#{order.customer_id.slice(0, 8)}</p>
                    </div>
                  </div>
                  {order.customer_phone && (
                    <div className="flex items-center gap-2 text-xs text-[#404754]">
                      <Phone className="w-3.5 h-3.5" />
                      {order.customer_phone}
                    </div>
                  )}
                  {order.customer_email && (
                    <div className="flex items-center gap-2 text-xs text-[#404754]">
                      <Mail className="w-3.5 h-3.5" />
                      {order.customer_email}
                    </div>
                  )}
                  {order.customer_address && (
                    <div className="flex items-start gap-2 text-xs text-[#404754]">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {order.customer_address}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[#404754] italic">Khách lẻ</p>
              )}
            </section>

            {/* Quick actions */}
            <section className="bg-white border border-[#c0c6d6] rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-bold text-[#0d1d29] mb-3">Xử lý đơn hàng</h3>
              {order.status === "new" && hasPermission("orders.approve") ? (
                <button
                  onClick={confirmOrderNow}
                  disabled={busy}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-[#005baf] hover:bg-[#005eb3] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  Xác nhận đơn hàng (trừ tồn kho)
                </button>
              ) : null}
              {order.status === "completed" && hasPermission("orders.fulfill") &&
                NEXT_FULFILLMENT[order.fulfillment_status]?.map((step) => (
                  <button
                    key={step.key}
                    onClick={() => advanceFulfillment(step.key)}
                    disabled={busy}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                      step.danger
                        ? "border border-red-200 text-red-600 hover:bg-red-50"
                        : "bg-[#005baf] hover:bg-[#005eb3] text-white"
                    }`}
                  >
                    {step.danger ? <RefreshCw className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    {step.label}
                  </button>
                ))}
              {order.status === "completed" && order.fulfillment_status === "returned" && (
                <p className="text-xs text-[#404754] italic px-1">Đơn hàng đã hoàn trả, không còn bước xử lý tiếp theo.</p>
              )}

              <h3 className="text-sm font-bold text-[#0d1d29] mb-3 mt-4">Thao tác nhanh</h3>
              {order.status === "completed" && (
                <button
                  onClick={() => router.push(`/orders/returns/new/${orderId}`)}
                  className="w-full flex items-center gap-2 px-3 py-2 border border-[#c0c6d6] rounded-lg hover:bg-[#ebf5ff] text-sm text-[#404754] transition-colors"
                >
                  <Undo2 className="w-4 h-4" />
                  Đổi trả hàng
                </button>
              )}
              <button
                onClick={() => router.push(`/shipping/orders/new?order_id=${orderId}`)}
                disabled={order.status === "cancelled"}
                className="w-full flex items-center gap-2 px-3 py-2 border border-[#c0c6d6] rounded-lg hover:bg-[#ebf5ff] text-sm text-[#404754] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Truck className="w-4 h-4" />
                Giao hàng
              </button>
              {hasPermission("orders.edit") ? (
                <button
                  onClick={() => router.push(`/orders/${orderId}/edit`)}
                  className="w-full flex items-center gap-2 px-3 py-2 border border-[#c0c6d6] rounded-lg hover:bg-[#ebf5ff] text-sm text-[#404754] transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Sửa đơn hàng
                </button>
              ) : null}
              <button
                onClick={cancelOrder}
                disabled={busy || order.status === "cancelled"}
                className="w-full flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle className="w-4 h-4" />
                Huỷ đơn hàng
              </button>
            </section>
          </div>
        </div>
      </main>

      <PrintableInvoice order={order} store={store} />
    </div>
    </PageGuard>
  );
}

function TimelineItem({
  icon,
  time,
  text,
  color,
}: {
  icon: React.ReactNode;
  time: string;
  text: string;
  color: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-[#0d1d29]">{text}</p>
        <p className="text-xs text-[#404754]">{fmtDate(time)}</p>
      </div>
    </div>
  );
}
