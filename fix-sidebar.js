const fs = require(''fs'');
const path = 'D:/InvoiceFlowManager/components/layouts/DashboardLayout.tsx';
let s = fs.readFileSync(path, 'utf8');
s = s.replace(/const navItems = \[[\s\S]*?\n\];/, String.raw`const navItems = [
  { key: "dashboard", path: "/", label: "Dashboard", group: "T\u1ed5ng quan", icon: LayoutDashboard },
  { key: "scan", path: "/scan", label: "Scan & t\u00e0i li\u1ec7u", group: "H\u00f3a \u0111\u01a1n", icon: FileSpreadsheet },
  { key: "summary", path: "/summary", label: "T\u1ed5ng h\u1ee3p h\u00f3a \u0111\u01a1n", group: "H\u00f3a \u0111\u01a1n", icon: Table2 },
  { key: "documents", path: "/documents", label: "T\u00e0i li\u1ec7u h\u00f3a \u0111\u01a1n", group: "H\u00f3a \u0111\u01a1n", icon: FileText },
  {
    key: "customers", path: "/customers", label: "Kh\u00e1ch h\u00e0ng", group: "Kh\u00e1ch h\u00e0ng", icon: Users,
    subItems: [
      { key: "customer-list", path: "/customers", label: "Danh s\u00e1ch kh\u00e1ch h\u00e0ng" },
      { key: "customer-groups", path: "/customers/groups", label: "Nh\u00f3m kh\u00e1ch h\u00e0ng" }
    ]
  },
  {
    key: "products", path: "/products", label: "S\u1ea3n ph\u1ea9m / SKU", group: "V\u1eadn h\u00e0nh", icon: Package,
    subItems: [
      { key: "product-list", path: "/products", label: "Danh s\u00e1ch s\u1ea3n ph\u1ea9m" },
      { key: "product-inventory", path: "/products/inventory", label: "Qu\u1ea3n l\u00fd kho" },
      { key: "product-categories", path: "/products/categories", label: "Danh m\u1ee5c s\u1ea3n ph\u1ea9m" },
      { key: "product-pricing", path: "/products/pricing", label: "B\u1ea3ng gi\u00e1" }
    ]
  },
  {
    key: "orders", path: "/orders", label: "\u0110\u01a1n h\u00e0ng", group: "V\u1eadn h\u00e0nh", icon: ShoppingCart,
    subItems: [
      { key: "orders-list", path: "/orders", label: "T\u1ea5t c\u1ea3 \u0111\u01a1n h\u00e0ng" },
      { key: "orders-new", path: "/orders/new", label: "T\u1ea1o \u0111\u01a1n h\u00e0ng" },
      { key: "orders-parse", path: "/orders/parse", label: "T\u1ea1o t\u1eeb AI parse" }
    ]
  },
  {
    key: "shipping", path: "/shipping", label: "V\u1eadn chuy\u1ec3n", group: "V\u1eadn h\u00e0nh", icon: Truck,
    subItems: [
      { key: "shipping-overview", path: "/shipping", label: "T\u1ed5ng quan" },
      { key: "shipping-list", path: "/shipping/orders", label: "Qu\u1ea3n l\u00fd v\u1eadn \u0111\u01a1n" },
      { key: "shipping-new", path: "/shipping/orders/new", label: "T\u1ea1o v\u1eadn \u0111\u01a1n" },
      { key: "shipping-config", path: "/shipping/config", label: "C\u1ea5u h\u00ecnh v\u1eadn chuy\u1ec3n" }
    ]
  },
  { key: "reports", path: "/reports", label: "B\u00e1o c\u00e1o", group: "V\u1eadn h\u00e0nh", icon: BarChart3 },
  { key: "finance", path: "/finance", label: "T\u00e0i ch\u00ednh & C\u00f4ng n\u1ee3", group: "V\u1eadn h\u00e0nh", icon: Wallet },
  { key: "automations", path: "/automations", label: "T\u1ef1 \u0111\u1ed9ng h\u00f3a", group: "V\u1eadn h\u00e0nh", icon: Zap },
  { key: "assistant", path: "/assistant", label: "Tr\u1ee3 l\u00fd AI", group: "H\u1ec7 th\u1ed1ng", icon: Sparkles },
  { key: "settings", path: "/settings", label: "C\u00e0i \u0111\u1eb7t", group: "H\u1ec7 th\u1ed1ng", icon: Settings },
  { key: "blueprint", path: "/blueprint", label: "Design Blueprint", group: "H\u1ec7 th\u1ed1ng", icon: FileText }
];`);
s = s.replace(/<div className=\"truncate font-medium text-sidebar-foreground\">[\s\S]*?<\/div>\n\s*<div className=\"truncate text-sidebar-foreground opacity-60\">[\s\S]*?<\/div>/, `<div className=\"truncate font-medium text-sidebar-foreground\">C\u00f4ng ty ABC</div>\n            <div className=\"truncate text-sidebar-foreground opacity-60\">nh\u00e2n vi\u00ean \u00b7 kho HCM</div>`);
s = s.replace(/aria-label=\"[^\"]*th\u00f4ng b\u00e1o l\u1ed7i[^\"]*\"/i, 'aria-label=\"\u0110\u00f3ng th\u00f4ng b\u00e1o l\u1ed7i\"');
s = s.replace(/aria-label=\"[^\"]*th\u00f4ng b\u00e1o[^\"]*\"/i, 'aria-label=\"\u0110\u00f3ng th\u00f4ng b\u00e1o\"');
s = s.replace(/aria-label=\"[^\"]*menu[^\"]*\"/i, 'aria-label=\"\u0110\u00f3ng menu\"');
s = s.replace(/aria-label=\"[^\"]*sidebar[^\"]*\"/i, 'aria-label=\"M\u1edf r\u1ed9ng sidebar\"');
s = s.replace(/<span>[^<]*T\u00ecm ki\u1ebfm nhanh[^<]*<\/span>/i, '<span>T\u00ecm ki\u1ebfm nhanh...</span>');
s = s.replace(/<button className=\"relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground\" aria-label=\"[^\"]*\" type=\"button\">/, '<button className=\"relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground\" aria-label=\"Th\u00f4ng b\u00e1o\" type=\"button\">');
s = s.replace(/label: \"[^\"]*B\u1ea3ng[^\"]*\"/, 'label: \"B\u1ea3ng\"');
s = s.replace(/label: \"[^\"]*T\u1ed5ng h\u1ee3p[^\"]*\"/, 'label: \"T\u1ed5ng h\u1ee3p\"');
s = s.replace(/label: \"[^\"]*V\u1eadn h\u00e0nh[^\"]*\"/, 'label: \"V\u1eadn h\u00e0nh\"');
s = s.replace(/label: \"[^\"]*C\u00e0i \u0111\u1eb7t[^\"]*\"/, 'label: \"C\u00e0i \u0111\u1eb7t\"');
fs.writeFileSync(path, s, 'utf8');
