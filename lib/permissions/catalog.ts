export interface PermissionActionDef {
  key: string;
  label: string;
}

export interface PermissionModuleDef {
  key: string;
  label: string;
  actions: PermissionActionDef[];
}

const A = {
  view: { key: "view", label: "Xem" },
  create: { key: "create", label: "Tạo" },
  edit: { key: "edit", label: "Sửa" },
  delete: { key: "delete", label: "Xoá" },
  export: { key: "export", label: "Xuất file" },
  import: { key: "import", label: "Nhập file" }
};

export const PERMISSION_CATALOG: PermissionModuleDef[] = [
  {
    key: "products",
    label: "Sản phẩm",
    actions: [A.view, A.create, A.edit, A.delete, A.export, A.import]
  },
  {
    key: "inventory",
    label: "Kho / Tồn kho",
    actions: [A.view, A.create, A.edit]
  },
  {
    key: "purchase_orders",
    label: "Đặt hàng nhập",
    actions: [A.view, A.create, A.edit]
  },
  {
    key: "goods_receipts",
    label: "Nhập hàng",
    actions: [A.view, A.create, A.edit, { key: "pay", label: "Thanh toán đơn nhập" }]
  },
  {
    key: "stock_checks",
    label: "Kiểm hàng",
    actions: [A.view, A.create, { key: "balance", label: "Cân bằng kho" }]
  },
  {
    key: "cost_adjustments",
    label: "Điều chỉnh giá vốn",
    actions: [A.view, A.create, A.edit]
  },
  {
    key: "suppliers",
    label: "Nhà cung cấp",
    actions: [A.view, A.create, A.edit, A.delete]
  },
  {
    key: "orders",
    label: "Đơn hàng",
    actions: [
      A.view,
      A.create,
      A.edit,
      A.delete,
      A.export,
      A.import,
      { key: "approve", label: "Duyệt đơn hàng" },
      { key: "fulfill", label: "Đóng gói và giao hàng" }
    ]
  },
  {
    key: "order_returns",
    label: "Đơn trả hàng",
    actions: [A.view, A.create]
  },
  {
    key: "customers",
    label: "Khách hàng",
    actions: [A.view, A.create, A.edit, A.delete]
  },
  {
    key: "promotions",
    label: "Khuyến mại",
    actions: [A.view, A.create, A.edit, A.delete]
  },
  {
    key: "shipping",
    label: "Vận chuyển",
    actions: [A.view, A.create, A.edit, A.delete, { key: "manage_settings", label: "Cấu hình vận chuyển" }]
  },
  {
    key: "receipt_vouchers",
    label: "Phiếu thu",
    actions: [A.view, A.create, A.edit, A.delete]
  },
  {
    key: "payment_vouchers",
    label: "Phiếu chi",
    actions: [A.view, A.create, A.edit, A.delete]
  },
  {
    key: "reports",
    label: "Báo cáo",
    actions: [
      { key: "view_sales", label: "Báo cáo bán hàng" },
      { key: "view_purchases", label: "Báo cáo nhập hàng" },
      { key: "view_inventory", label: "Báo cáo kho" },
      { key: "view_finance", label: "Báo cáo tài chính" },
      { key: "view_customers", label: "Báo cáo khách hàng" },
      { key: "export_inventory", label: "Xuất file báo cáo kho" }
    ]
  },
  {
    key: "automations",
    label: "Tự động hoá",
    actions: [A.view, A.create, A.edit, A.delete]
  },
  {
    key: "settings",
    label: "Cấu hình & Nhân viên",
    actions: [
      { key: "manage_staff", label: "Quản lý nhân viên" },
      { key: "manage_roles", label: "Quản lý vai trò" },
      { key: "manage_storefront", label: "Cấu hình website bán hàng" }
    ]
  }
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_CATALOG.flatMap((mod) =>
  mod.actions.map((action) => `${mod.key}.${action.key}`)
);

export function isValidPermissionKey(key: string): boolean {
  return ALL_PERMISSION_KEYS.includes(key);
}
