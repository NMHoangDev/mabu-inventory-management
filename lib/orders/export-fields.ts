import type { ExcelColumnDef } from "@/lib/shared/excel-export";
import type { ExportFieldGroup } from "@/components/shared/ExcelExportDialog";

export const ORDER_EXPORT_COLUMNS: Record<string, ExcelColumnDef> = {
  code: { key: "code", header: "Mã đơn hàng", width: 18 },
  created_at: { key: "created_at", header: "Ngày tạo", width: 18, format: "datetime" },
  updated_at: { key: "updated_at", header: "Ngày cập nhật", width: 18, format: "datetime" },
  status: { key: "status", header: "Trạng thái đơn hàng", width: 16 },
  payment_status: { key: "payment_status", header: "Trạng thái thanh toán", width: 16 },
  fulfillment_status: { key: "fulfillment_status", header: "Trạng thái giao hàng", width: 16 },
  customer_name: { key: "customer_name", header: "Tên khách hàng", width: 20 },
  customer_phone: { key: "customer_phone", header: "Số điện thoại", width: 14 },
  note: { key: "note", header: "Ghi chú đơn hàng", width: 24 },
  branch: { key: "branch", header: "Chi nhánh", width: 16 },
  staff: { key: "staff", header: "Nhân viên", width: 16 },
  source: { key: "source", header: "Nguồn đơn", width: 14 },
  payment_method: { key: "payment_method", header: "Phương thức thanh toán", width: 16 },
  subtotal: { key: "subtotal", header: "Tổng tiền sản phẩm", width: 16, format: "money" },
  discount: { key: "discount", header: "Chiết khấu đơn hàng", width: 16, format: "money" },
  discount_type: { key: "discount_type", header: "Loại chiết khấu đơn", width: 14 },
  shipping_fee: { key: "shipping_fee", header: "Phí vận chuyển", width: 14, format: "money" },
  total: { key: "total", header: "Khách phải trả", width: 16, format: "money" },
  paid: { key: "paid", header: "Khách đã trả", width: 16, format: "money" },
  product_sku: { key: "product_sku", header: "Mã sản phẩm", width: 16 },
  product_name: { key: "product_name", header: "Tên sản phẩm", width: 24 },
  unit: { key: "unit", header: "Đơn vị tính", width: 12 },
  quantity: { key: "quantity", header: "Số lượng sản phẩm", width: 14, format: "number" },
  unit_price: { key: "unit_price", header: "Đơn giá bán", width: 16, format: "money" },
  discount_type_item: { key: "discount_type_item", header: "Loại chiết khấu sản phẩm", width: 16 },
  discount_value: { key: "discount_value", header: "Chiết khấu sản phẩm", width: 16, format: "money" },
  line_total: { key: "line_total", header: "Thành tiền sản phẩm", width: 16, format: "money" },
  item_note: { key: "item_note", header: "Ghi chú sản phẩm", width: 24 }
};

export const ORDER_EXPORT_GROUPS: ExportFieldGroup[] = [
  {
    key: "order_info",
    label: "Thông tin đơn hàng",
    fields: [
      { key: "code", label: "Mã đơn hàng" },
      { key: "created_at", label: "Ngày tạo" },
      { key: "updated_at", label: "Ngày cập nhật" },
      { key: "status", label: "Trạng thái đơn hàng" },
      { key: "payment_status", label: "Trạng thái thanh toán" },
      { key: "fulfillment_status", label: "Trạng thái giao hàng" },
      { key: "customer_name", label: "Tên khách hàng" },
      { key: "customer_phone", label: "Số điện thoại" },
      { key: "note", label: "Ghi chú đơn hàng" },
      { key: "branch", label: "Chi nhánh" },
      { key: "staff", label: "Nhân viên" },
      { key: "source", label: "Nguồn đơn" },
      { key: "payment_method", label: "Phương thức thanh toán" },
      { key: "subtotal", label: "Tổng tiền sản phẩm" },
      { key: "discount", label: "Chiết khấu đơn hàng" },
      { key: "discount_type", label: "Loại chiết khấu đơn" },
      { key: "shipping_fee", label: "Phí vận chuyển" },
      { key: "total", label: "Khách phải trả" },
      { key: "paid", label: "Khách đã trả" }
    ]
  },
  {
    key: "shipping_info",
    label: "Thông tin giao hàng",
    fields: [
      { key: "shipping_fee", label: "Phí vận chuyển" },
      { key: "fulfillment_status", label: "Trạng thái giao hàng" },
      { key: "source", label: "Nguồn đơn" }
    ]
  },
  {
    key: "product_info",
    label: "Sản phẩm",
    visibleForExportType: ["product_summary", "detail"],
    fields: [
      { key: "product_sku", label: "Mã sản phẩm" },
      { key: "product_name", label: "Tên sản phẩm" },
      { key: "unit", label: "Đơn vị tính" },
      { key: "quantity", label: "Số lượng sản phẩm" },
      { key: "unit_price", label: "Đơn giá bán" },
      { key: "discount_type_item", label: "Loại chiết khấu sản phẩm" },
      { key: "discount_value", label: "Chiết khấu sản phẩm" },
      { key: "line_total", label: "Thành tiền sản phẩm" },
      { key: "item_note", label: "Ghi chú sản phẩm" }
    ]
  }
];

export const ORDER_EXPORT_TYPE_OPTIONS = [
  { value: "order_summary", label: "File tổng quan theo đơn hàng" },
  { value: "product_summary", label: "File tổng quan theo sản phẩm" },
  { value: "detail", label: "File chi tiết" }
];
