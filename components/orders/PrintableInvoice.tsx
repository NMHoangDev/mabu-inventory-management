import { formatCurrencyVND } from "@/lib/shared/format";

interface PrintableInvoiceItem {
  id: string;
  product_name: string;
  product_sku: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_type: "amount" | "percent";
  discount_value: number;
  line_total: number;
  note?: string;
}

interface PrintableInvoiceOrder {
  code: string;
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  branch: string;
  staff: string;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  paid: number;
  note?: string;
  created_at: string;
  items: PrintableInvoiceItem[];
}

interface StoreInfo {
  name: string;
  phone: string;
  address: string;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function itemDiscountAmount(item: PrintableInvoiceItem): number {
  const base = item.quantity * item.unit_price;
  const raw = item.discount_type === "percent" ? (base * item.discount_value) / 100 : item.discount_value;
  return Math.min(base, Math.max(0, raw));
}

/**
 * Layout hoá đơn dành riêng để IN — không hiện trên màn hình (`hidden`), chỉ
 * hiện khi `window.print()` được gọi (`print:block` + CSS `.print-invoice-root`
 * ở app/globals.css ẩn toàn bộ phần còn lại của trang). Không dùng thư viện
 * PDF/print nào — chỉ CSS `@media print`, đơn giản và không thêm dependency.
 */
export function PrintableInvoice({ order, store }: { order: PrintableInvoiceOrder; store: StoreInfo }) {
  const itemDiscountTotal = order.items.reduce((s, item) => s + itemDiscountAmount(item), 0);
  const remaining = Math.max(0, order.total - order.paid);

  return (
    <div className="print-invoice-root hidden print:block bg-white text-black p-8 text-sm">
      <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-4">
        <div>
          <h1 className="text-xl font-bold">{store.name}</h1>
          {store.address && <p className="text-xs mt-1">{store.address}</p>}
          {store.phone && <p className="text-xs">ĐT: {store.phone}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold uppercase">Hoá đơn bán hàng</h2>
          <p className="text-xs mt-1">Mã đơn: #{order.code}</p>
          <p className="text-xs">Ngày: {fmtDate(order.created_at)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
        <div>
          <p className="font-bold mb-1">Khách hàng</p>
          <p>{order.customer_name || "Khách lẻ"}</p>
          {order.customer_phone && <p>ĐT: {order.customer_phone}</p>}
          {order.customer_address && <p>{order.customer_address}</p>}
        </div>
        <div className="text-right">
          <p>
            <span className="font-bold">Chi nhánh: </span>
            {order.branch}
          </p>
          <p>
            <span className="font-bold">Nhân viên: </span>
            {order.staff}
          </p>
        </div>
      </div>

      <table className="w-full border-collapse text-xs mb-4">
        <thead>
          <tr className="border-t-2 border-b-2 border-black">
            <th className="text-left py-1.5 pr-2">#</th>
            <th className="text-left py-1.5 pr-2">Sản phẩm</th>
            <th className="text-right py-1.5 pr-2">SL</th>
            <th className="text-right py-1.5 pr-2">Đơn giá</th>
            <th className="text-right py-1.5 pr-2">Giảm giá</th>
            <th className="text-right py-1.5">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, idx) => (
            <tr key={item.id} className="border-b border-gray-300">
              <td className="py-1.5 pr-2 align-top">{idx + 1}</td>
              <td className="py-1.5 pr-2 align-top">
                <p>{item.product_name}</p>
                <p className="text-[10px] text-gray-600">
                  SKU: {item.product_sku || "—"} · {item.unit}
                </p>
                {item.note && <p className="text-[10px] italic text-gray-600">Ghi chú: {item.note}</p>}
              </td>
              <td className="py-1.5 pr-2 align-top text-right">{item.quantity}</td>
              <td className="py-1.5 pr-2 align-top text-right">{formatCurrencyVND(item.unit_price)}</td>
              <td className="py-1.5 pr-2 align-top text-right">
                {itemDiscountAmount(item) > 0 ? formatCurrencyVND(itemDiscountAmount(item)) : "—"}
              </td>
              <td className="py-1.5 align-top text-right font-medium">{formatCurrencyVND(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mb-4">
        <div className="w-64 text-xs space-y-1">
          <div className="flex justify-between">
            <span>Tổng tiền sản phẩm</span>
            <span>{formatCurrencyVND(order.subtotal)}</span>
          </div>
          {itemDiscountTotal > 0 && (
            <div className="flex justify-between">
              <span>Chiết khấu sản phẩm</span>
              <span>-{formatCurrencyVND(itemDiscountTotal)}</span>
            </div>
          )}
          {order.discount > 0 && (
            <div className="flex justify-between">
              <span>Chiết khấu đơn</span>
              <span>-{formatCurrencyVND(order.discount)}</span>
            </div>
          )}
          {order.shipping_fee > 0 && (
            <div className="flex justify-between">
              <span>Phí giao hàng</span>
              <span>+{formatCurrencyVND(order.shipping_fee)}</span>
            </div>
          )}
          <div className="flex justify-between border-t-2 border-black pt-1 font-bold text-sm">
            <span>Khách phải trả</span>
            <span>{formatCurrencyVND(order.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>Đã thanh toán</span>
            <span>{formatCurrencyVND(order.paid)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Còn lại</span>
            <span>{formatCurrencyVND(remaining)}</span>
          </div>
        </div>
      </div>

      {order.note && (
        <div className="text-xs mb-6">
          <span className="font-bold">Ghi chú: </span>
          {order.note}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mt-12 text-xs text-center">
        <div>
          <p className="font-bold">Người mua hàng</p>
          <p className="text-[10px] text-gray-600 mt-1">(Ký, ghi rõ họ tên)</p>
        </div>
        <div>
          <p className="font-bold">Người bán hàng</p>
          <p className="text-[10px] text-gray-600 mt-1">(Ký, ghi rõ họ tên)</p>
        </div>
      </div>
    </div>
  );
}
