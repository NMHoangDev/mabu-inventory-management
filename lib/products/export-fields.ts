import type { ExcelColumnDef } from "@/lib/shared/excel-export";
import type { ExportFieldGroup } from "@/components/shared/ExcelExportDialog";

export const PRODUCT_EXPORT_COLUMNS: Record<string, ExcelColumnDef> = {
  name: { key: "name", header: "Tên sản phẩm", width: 26 },
  sku: { key: "sku", header: "SKU", width: 16 },
  barcode: { key: "barcode", header: "Mã vạch", width: 16 },
  unit: { key: "unit", header: "Đơn vị tính", width: 12 },
  category_name: { key: "category_name", header: "Danh mục", width: 18 },
  brand_name: { key: "brand_name", header: "Thương hiệu", width: 16 },
  type_name: { key: "type_name", header: "Loại sản phẩm", width: 16 },
  status: { key: "status", header: "Trạng thái", width: 12 },
  description: { key: "description", header: "Mô tả", width: 30 },
  price: { key: "price", header: "Giá bán lẻ", width: 14, format: "money" },
  compare_at_price: { key: "compare_at_price", header: "Giá so sánh", width: 14, format: "money" },
  cost_price: { key: "cost_price", header: "Giá vốn", width: 14, format: "money" },
  taxable: { key: "taxable", header: "Áp dụng thuế", width: 12 },
  track_inventory: { key: "track_inventory", header: "Quản lý tồn kho", width: 14 },
  allow_negative_stock: { key: "allow_negative_stock", header: "Cho phép âm kho", width: 14 },
  manage_expiry: { key: "manage_expiry", header: "Quản lý hạn sử dụng", width: 14 },
  requires_shipping: { key: "requires_shipping", header: "Cần vận chuyển", width: 14 },
  weight: { key: "weight", header: "Khối lượng", width: 12, format: "number" },
  weight_unit: { key: "weight_unit", header: "Đơn vị khối lượng", width: 12 },
  total_inventory: { key: "total_inventory", header: "Tồn kho", width: 12, format: "number" },
  variant_count: { key: "variant_count", header: "Số phiên bản", width: 12, format: "number" },
  tags: { key: "tags", header: "Tags", width: 20 },
  sales_channels: { key: "sales_channels", header: "Kênh bán", width: 20 },
  theme_template: { key: "theme_template", header: "Mẫu giao diện", width: 14 },
  slug: { key: "slug", header: "Slug", width: 20 },
  seo_title: { key: "seo_title", header: "SEO Title", width: 20 },
  seo_description: { key: "seo_description", header: "SEO Description", width: 26 },
  published_at: { key: "published_at", header: "Ngày xuất bản", width: 16, format: "datetime" },
  created_at: { key: "created_at", header: "Ngày tạo", width: 16, format: "datetime" },
  updated_at: { key: "updated_at", header: "Ngày cập nhật", width: 16, format: "datetime" }
};

export const PRODUCT_EXPORT_GROUPS: ExportFieldGroup[] = [
  {
    key: "basic_info",
    label: "Thông tin cơ bản",
    fields: [
      { key: "name", label: "Tên sản phẩm" },
      { key: "sku", label: "SKU" },
      { key: "barcode", label: "Mã vạch" },
      { key: "unit", label: "Đơn vị tính" },
      { key: "category_name", label: "Danh mục" },
      { key: "brand_name", label: "Thương hiệu" },
      { key: "type_name", label: "Loại sản phẩm" },
      { key: "status", label: "Trạng thái" },
      { key: "description", label: "Mô tả" }
    ]
  },
  {
    key: "price_stock",
    label: "Giá & tồn kho",
    fields: [
      { key: "price", label: "Giá bán lẻ" },
      { key: "compare_at_price", label: "Giá so sánh" },
      { key: "cost_price", label: "Giá vốn" },
      { key: "taxable", label: "Áp dụng thuế" },
      { key: "track_inventory", label: "Quản lý tồn kho" },
      { key: "allow_negative_stock", label: "Cho phép âm kho" },
      { key: "manage_expiry", label: "Quản lý hạn sử dụng" },
      { key: "requires_shipping", label: "Cần vận chuyển" },
      { key: "weight", label: "Khối lượng" },
      { key: "weight_unit", label: "Đơn vị khối lượng" },
      { key: "total_inventory", label: "Tồn kho" },
      { key: "variant_count", label: "Số phiên bản" }
    ]
  },
  {
    key: "seo_classification",
    label: "Phân loại & SEO",
    fields: [
      { key: "tags", label: "Tags" },
      { key: "sales_channels", label: "Kênh bán" },
      { key: "theme_template", label: "Mẫu giao diện" },
      { key: "slug", label: "Slug" },
      { key: "seo_title", label: "SEO Title" },
      { key: "seo_description", label: "SEO Description" },
      { key: "published_at", label: "Ngày xuất bản" },
      { key: "created_at", label: "Ngày tạo" },
      { key: "updated_at", label: "Ngày cập nhật" }
    ]
  }
];
