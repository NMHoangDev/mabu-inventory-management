import type { ExcelColumnDef } from "@/lib/shared/excel-export";
import type { ExportFieldGroup } from "@/components/shared/ExcelExportDialog";

export type InventoryExportGroupBy = "detail" | "ledger" | "below_threshold" | "above_threshold" | "in_out" | "stock_check";

interface ReportFieldDef {
  key: string;
  label: string;
  column: ExcelColumnDef;
}

const REPORT_FIELDS: Record<InventoryExportGroupBy, ReportFieldDef[]> = {
  detail: [
    { key: "product_name", label: "Tên sản phẩm", column: { key: "product_name", header: "Tên sản phẩm", width: 24 } },
    { key: "sku", label: "SKU", column: { key: "sku", header: "SKU", width: 16 } },
    { key: "category_name", label: "Danh mục", column: { key: "category_name", header: "Danh mục", width: 18 } },
    { key: "branch", label: "Chi nhánh", column: { key: "branch", header: "Chi nhánh", width: 16 } },
    { key: "available_quantity", label: "Tồn khả dụng", column: { key: "available_quantity", header: "Tồn khả dụng", width: 14, format: "number" } },
    { key: "reserved_quantity", label: "Tồn đang giữ", column: { key: "reserved_quantity", header: "Tồn đang giữ", width: 14, format: "number" } },
    { key: "cost_price", label: "Giá vốn", column: { key: "cost_price", header: "Giá vốn", width: 14, format: "money" } },
    { key: "total_value", label: "Giá trị tồn", column: { key: "total_value", header: "Giá trị tồn", width: 16, format: "money" } },
    { key: "status", label: "Trạng thái", column: { key: "status", header: "Trạng thái", width: 12 } }
  ],
  ledger: [
    { key: "date", label: "Ngày", column: { key: "date", header: "Ngày", width: 14, format: "datetime" } },
    { key: "reference", label: "Chứng từ", column: { key: "reference", header: "Chứng từ", width: 16 } },
    { key: "product_name", label: "Tên sản phẩm", column: { key: "product_name", header: "Tên sản phẩm", width: 24 } },
    { key: "sku", label: "SKU", column: { key: "sku", header: "SKU", width: 16 } },
    { key: "branch", label: "Chi nhánh", column: { key: "branch", header: "Chi nhánh", width: 16 } },
    { key: "staff", label: "Nhân viên", column: { key: "staff", header: "Nhân viên", width: 16 } },
    { key: "type", label: "Loại", column: { key: "type", header: "Loại", width: 12 } },
    { key: "quantity", label: "Số lượng", column: { key: "quantity", header: "Số lượng", width: 12, format: "number" } },
    { key: "amount", label: "Giá trị", column: { key: "amount", header: "Giá trị", width: 16, format: "money" } }
  ],
  below_threshold: [
    { key: "product_name", label: "Tên sản phẩm", column: { key: "product_name", header: "Tên sản phẩm", width: 24 } },
    { key: "sku", label: "SKU", column: { key: "sku", header: "SKU", width: 16 } },
    { key: "category_name", label: "Danh mục", column: { key: "category_name", header: "Danh mục", width: 18 } },
    { key: "branch", label: "Chi nhánh", column: { key: "branch", header: "Chi nhánh", width: 16 } },
    { key: "current_qty", label: "Tồn hiện tại", column: { key: "current_qty", header: "Tồn hiện tại", width: 14, format: "number" } },
    { key: "min_stock", label: "Tồn tối thiểu", column: { key: "min_stock", header: "Tồn tối thiểu", width: 14, format: "number" } },
    { key: "shortage", label: "Thiếu hụt", column: { key: "shortage", header: "Thiếu hụt", width: 14, format: "number" } }
  ],
  above_threshold: [
    { key: "product_name", label: "Tên sản phẩm", column: { key: "product_name", header: "Tên sản phẩm", width: 24 } },
    { key: "sku", label: "SKU", column: { key: "sku", header: "SKU", width: 16 } },
    { key: "category_name", label: "Danh mục", column: { key: "category_name", header: "Danh mục", width: 18 } },
    { key: "branch", label: "Chi nhánh", column: { key: "branch", header: "Chi nhánh", width: 16 } },
    { key: "current_qty", label: "Tồn hiện tại", column: { key: "current_qty", header: "Tồn hiện tại", width: 14, format: "number" } },
    { key: "max_stock", label: "Tồn tối đa", column: { key: "max_stock", header: "Tồn tối đa", width: 14, format: "number" } },
    { key: "excess", label: "Vượt định mức", column: { key: "excess", header: "Vượt định mức", width: 14, format: "number" } },
    { key: "capital_locked", label: "Vốn tồn đọng", column: { key: "capital_locked", header: "Vốn tồn đọng", width: 16, format: "money" } }
  ],
  in_out: [
    { key: "sku", label: "SKU", column: { key: "sku", header: "SKU", width: 16 } },
    { key: "product_name", label: "Tên sản phẩm", column: { key: "product_name", header: "Tên sản phẩm", width: 24 } },
    { key: "category_name", label: "Danh mục", column: { key: "category_name", header: "Danh mục", width: 18 } },
    { key: "import_qty", label: "SL nhập", column: { key: "import_qty", header: "SL nhập", width: 12, format: "number" } },
    { key: "import_value", label: "Giá trị nhập", column: { key: "import_value", header: "Giá trị nhập", width: 16, format: "money" } },
    { key: "export_qty", label: "SL xuất", column: { key: "export_qty", header: "SL xuất", width: 12, format: "number" } }
  ],
  stock_check: [
    { key: "code", label: "Mã kiểm hàng", column: { key: "code", header: "Mã kiểm hàng", width: 16 } },
    { key: "branch", label: "Chi nhánh", column: { key: "branch", header: "Chi nhánh", width: 16 } },
    { key: "staff", label: "Nhân viên", column: { key: "staff", header: "Nhân viên", width: 16 } },
    { key: "status", label: "Trạng thái", column: { key: "status", header: "Trạng thái", width: 12 } },
    { key: "total_items", label: "Tổng SP", column: { key: "total_items", header: "Tổng SP", width: 12, format: "number" } },
    { key: "variance_items", label: "SP lệch", column: { key: "variance_items", header: "SP lệch", width: 12, format: "number" } },
    { key: "created_at", label: "Ngày tạo", column: { key: "created_at", header: "Ngày tạo", width: 16, format: "datetime" } }
  ]
};

export function getInventoryExportGroups(groupBy: InventoryExportGroupBy): ExportFieldGroup[] {
  const fields = REPORT_FIELDS[groupBy];
  return [{ key: "fields", label: "Trường dữ liệu", fields: fields.map((f) => ({ key: f.key, label: f.label })) }];
}

export function getInventoryExportColumns(groupBy: InventoryExportGroupBy): Record<string, ExcelColumnDef> {
  const fields = REPORT_FIELDS[groupBy];
  return Object.fromEntries(fields.map((f) => [f.key, f.column]));
}

export const INVENTORY_REPORT_SHEET_NAMES: Record<InventoryExportGroupBy, string> = {
  detail: "Ton kho chi tiet",
  ledger: "So kho",
  below_threshold: "Duoi dinh muc",
  above_threshold: "Tren dinh muc",
  in_out: "Xuat nhap ton",
  stock_check: "Kiem hang"
};
