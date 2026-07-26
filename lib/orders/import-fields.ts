import type { ExcelColumnDef } from "@/lib/shared/excel-export";

export const ORDER_IMPORT_TEMPLATE_COLUMNS: ExcelColumnDef[] = [
  { key: "temp_code", header: "Mã đơn tạm", width: 16 },
  { key: "customer_name", header: "Tên khách hàng", width: 20 },
  { key: "customer_phone", header: "SĐT khách hàng", width: 16 },
  { key: "product_sku", header: "SKU sản phẩm", width: 16 },
  { key: "quantity", header: "Số lượng", width: 12, format: "number" },
  { key: "unit_price", header: "Đơn giá (bỏ trống = lấy giá sản phẩm)", width: 18, format: "money" },
  { key: "item_note", header: "Ghi chú dòng", width: 22 },
  { key: "order_note", header: "Ghi chú đơn", width: 22 },
  { key: "discount", header: "Chiết khấu đơn", width: 16, format: "money" },
  { key: "shipping_fee", header: "Phí vận chuyển", width: 16, format: "money" },
  { key: "source", header: "Nguồn đơn (store/facebook/zalo/website/other)", width: 20 }
];

export const ORDER_IMPORT_HEADER_MAP: Record<string, string> = {
  madontam: "temp_code",
  tenkhachhang: "customer_name",
  sdtkhachhang: "customer_phone",
  skusanpham: "product_sku",
  soluong: "quantity",
  dongiabotronglaygiasanpham: "unit_price",
  ghichudong: "item_note",
  ghichudon: "order_note",
  chietkhaudon: "discount",
  phivanchuyen: "shipping_fee",
  nguondonstorefacebookzalowebsiteother: "source",
  nguondon: "source"
};
