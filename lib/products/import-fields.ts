import type { ExcelColumnDef } from "@/lib/shared/excel-export";

export const PRODUCT_IMPORT_TEMPLATE_COLUMNS: ExcelColumnDef[] = [
  { key: "sku", header: "SKU", width: 16 },
  { key: "name", header: "Tên sản phẩm", width: 26 },
  { key: "barcode", header: "Mã vạch", width: 16 },
  { key: "unit", header: "Đơn vị tính", width: 12 },
  { key: "description", header: "Mô tả", width: 30 },
  { key: "price", header: "Giá bán", width: 14, format: "money" },
  { key: "compare_at_price", header: "Giá so sánh", width: 14, format: "money" },
  { key: "cost_price", header: "Giá vốn", width: 14, format: "money" },
  { key: "brand_name", header: "Thương hiệu", width: 16 },
  { key: "product_type_name", header: "Loại sản phẩm", width: 16 },
  { key: "status", header: "Trạng thái (active/inactive)", width: 16 }
];

/** header đã chuẩn hoá (bỏ dấu, lowercase, bỏ khoảng trắng) -> key */
export const PRODUCT_IMPORT_HEADER_MAP: Record<string, string> = {
  sku: "sku",
  tensanpham: "name",
  mavach: "barcode",
  donvitinh: "unit",
  mota: "description",
  giaban: "price",
  giasosanh: "compare_at_price",
  giavon: "cost_price",
  thuonghieu: "brand_name",
  loaisanpham: "product_type_name",
  trangthaiactiveinactive: "status",
  trangthai: "status"
};
