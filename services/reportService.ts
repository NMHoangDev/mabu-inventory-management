/**
 * Client-side service layer for report pages.
 * Calls /api/reports/* routes → falls back to individual API routes → falls back to mock.
 */

export type DateRange = { from: string; to: string };

// ─── Mock data generators ─────────────────────────────────────────────────────

function mockDailyData(from: string, to: string) {
  const pts: { day: string; receipt_count: number; total_amount: number }[] = [];
  const d0 = new Date(from);
  const d1 = new Date(to);
  for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
    pts.push({
      day: new Date(d).toISOString().slice(0, 10),
      receipt_count: Math.round(1 + Math.random() * 5),
      total_amount: Math.round((20 + Math.random() * 80) * 1e6),
    });
  }
  return pts;
}

function mockSupplierData() {
  const names = ["Công ty ABC", "Nhà phân phối XYZ", "Tổng công ty DM", "Đại lý Minh Anh", "Cửa hàng Hùng Phát"];
  return names.map((supplier_name) => {
    const total_amount = Math.round((50 + Math.random() * 300) * 1e6);
    const total_paid = Math.round(total_amount * (0.5 + Math.random() * 0.4));
    return { supplier_name, receipt_count: Math.round(5 + Math.random() * 30), total_amount, total_paid, unpaid: total_amount - total_paid };
  });
}

function mockProductData() {
  return Array.from({ length: 15 }, (_, i) => ({
    sku: `SKU-${String(i + 1).padStart(4, "0")}`,
    product_name: `Sản phẩm ${String.fromCharCode(65 + (i % 26))}${i > 25 ? Math.floor(i / 26) : ""}`,
    total_qty: Math.round(10 + Math.random() * 200),
    avg_price: Math.round(80000 + Math.random() * 200000),
    total_amount: 0,
  })).map((p) => ({ ...p, total_amount: p.total_qty * p.avg_price }));
}

function mockOrderData() {
  const statuses = ["Hoàn thành", "Đang xử lý", "Đã hủy", "Chờ duyệt"];
  const suppliers = ["Công ty ABC", "Nhà phân phối XYZ", "Tổng công ty DM"];
  const staffs = ["Nguyễn Văn A", "Trần Thị B", "Lê Văn C"];
  return Array.from({ length: 20 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - Math.floor(i / 3));
    const total = Math.round((5 + Math.random() * 100) * 1e6);
    return {
      code: `PN${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(i + 1).padStart(4, "0")}`,
      supplier_name: suppliers[i % suppliers.length],
      staff: staffs[i % staffs.length],
      received_at: d.toISOString(),
      receipt_status: statuses[i % statuses.length],
      total, paid: Math.round(total * 0.8), unpaid: Math.round(total * 0.2),
      item_count: Math.round(1 + Math.random() * 10),
    };
  });
}

function mockPaymentDaily(from: string, to: string) {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return {
      day: d.toISOString().slice(0, 10),
      total_paid: Math.round((20 + Math.random() * 60) * 1e6),
      total_unpaid: Math.round((5 + Math.random() * 20) * 1e6),
    };
  });
}

function mockPaymentMethodData() {
  return [
    { method: "Tiền mặt", payment_count: Math.round(5 + Math.random() * 20), total_paid: Math.round((50 + Math.random() * 150) * 1e6) },
    { method: "Chuyển khoản", payment_count: Math.round(3 + Math.random() * 15), total_paid: Math.round((80 + Math.random() * 200) * 1e6) },
    { method: "Quẹt thẻ", payment_count: Math.round(2 + Math.random() * 10), total_paid: Math.round((30 + Math.random() * 80) * 1e6) },
    { method: "Ví điện tử", payment_count: Math.round(1 + Math.random() * 5), total_paid: Math.round((10 + Math.random() * 40) * 1e6) },
  ];
}

function mockPaymentBranchData() {
  return [
    { branch: "Chi nhánh Q.1", receipt_count: Math.round(8 + Math.random() * 20), total_amount: Math.round((80 + Math.random() * 200) * 1e6), total_paid: 0, unpaid: 0 },
    { branch: "Chi nhánh Q.3", receipt_count: Math.round(6 + Math.random() * 15), total_amount: Math.round((60 + Math.random() * 150) * 1e6), total_paid: 0, unpaid: 0 },
    { branch: "Chi nhánh Hà Nội", receipt_count: Math.round(4 + Math.random() * 10), total_amount: Math.round((40 + Math.random() * 100) * 1e6), total_paid: 0, unpaid: 0 },
    { branch: "Chi nhánh Đà Nẵng", receipt_count: Math.round(3 + Math.random() * 8), total_amount: Math.round((30 + Math.random() * 80) * 1e6), total_paid: 0, unpaid: 0 },
    { branch: "Chi nhánh Cần Thơ", receipt_count: Math.round(2 + Math.random() * 5), total_amount: Math.round((20 + Math.random() * 50) * 1e6), total_paid: 0, unpaid: 0 },
  ].map((b) => ({ ...b, total_paid: Math.round(b.total_amount * 0.7), unpaid: Math.round(b.total_amount * 0.3) }));
}

function mockInventoryDetail() {
  return Array.from({ length: 20 }, (_, i) => {
    const qty = Math.round(5 + Math.random() * 200);
    return {
      id: String(i),
      product_name: `Sản phẩm ${String.fromCharCode(65 + i)}`,
      sku: `SKU-${String(i + 1).padStart(4, "0")}`,
      category_name: ["Điện tử", "Thời trang", "Thực phẩm", "Gia dụng"][i % 4],
      branch: ["Kho Q.1", "Kho Q.3", "Kho Hà Nội"][i % 3],
      available_quantity: qty,
      reserved_quantity: Math.round(Math.random() * 10),
      cost_price: Math.round(50000 + Math.random() * 500000),
      total_value: 0,
      status: "active",
    };
  }).map((p) => ({ ...p, total_value: p.available_quantity * p.cost_price }));
}

function mockBelowThreshold() {
  return Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    product_name: `Sản phẩm ${String.fromCharCode(65 + i)}`,
    sku: `SKU-${String(i + 1).padStart(4, "0")}`,
    category_name: ["Điện tử", "Thời trang", "Thực phẩm"][i % 3],
    branch: ["Kho Q.1", "Kho Q.3", "Kho Hà Nội"][i % 3],
    current_qty: Math.round(1 + Math.random() * 15),
    min_stock: Math.round(20 + Math.random() * 30),
    shortage: 0,
  })).map((p) => ({ ...p, shortage: Math.max(0, p.min_stock - p.current_qty) }));
}

function mockAboveThreshold() {
  return Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    product_name: `Sản phẩm ${String.fromCharCode(65 + i)}`,
    sku: `SKU-${String(i + 1).padStart(4, "0")}`,
    category_name: ["Điện tử", "Thời trang", "Thực phẩm"][i % 3],
    branch: ["Kho Q.1", "Kho Q.3", "Kho Hà Nội"][i % 3],
    current_qty: Math.round(80 + Math.random() * 300),
    max_stock: Math.round(50 + Math.random() * 100),
    excess: 0,
    cost_price: Math.round(30000 + Math.random() * 200000),
    capital_locked: 0,
  })).map((p) => ({ ...p, excess: Math.max(0, p.current_qty - p.max_stock), capital_locked: Math.max(0, p.current_qty - p.max_stock) * p.cost_price }));
}

function mockStockCheck() {
  const statuses = ["Hoàn thành", "Đang kiểm kê", "Chưa duyệt"];
  const branches = ["Kho Q.1", "Kho Q.3", "Kho Hà Nội", "Kho Đà Nẵng"];
  const staffs = ["Nguyễn Văn A", "Trần Thị B", "Lê Văn C"];
  return Array.from({ length: 15 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i * 3);
    return {
      id: String(i),
      code: `KK${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(i + 1).padStart(4, "0")}`,
      branch: branches[i % branches.length],
      staff: staffs[i % staffs.length],
      status: statuses[i % statuses.length],
      total_items: Math.round(10 + Math.random() * 50),
      variance_items: Math.round(Math.random() * 5),
      created_at: d.toISOString(),
    };
  });
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as T;
  } catch {
    return null;
  }
}

// ─── Purchase Reports ────────────────────────────────────────────────────────

export interface PurchaseReportSummary {
  total_receipts: number;
  total_quantity: number;
  total_amount: number;
  total_paid: number;
  total_unpaid: number;
}

export interface PurchaseDailyData {
  day: string;
  receipt_count?: number;
  total_amount?: number;
  total_paid?: number;
  total_unpaid?: number;
}

export interface SupplierPurchaseData {
  supplier_name: string;
  receipt_count: number;
  total_amount: number;
  total_paid: number;
  unpaid: number;
}

export interface ProductPurchaseData {
  sku: string;
  product_name: string;
  total_qty: number;
  avg_price: number;
  total_amount: number;
}

export interface PurchaseOrderData {
  code: string;
  supplier_name: string;
  staff: string;
  received_at: string;
  receipt_status: string;
  total: number;
  paid: number;
  unpaid: number;
  item_count: number;
}

export async function fetchPurchaseSummary(range: DateRange): Promise<PurchaseReportSummary> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/purchases?${params}`);
  if (data && !data.error && (data.total_receipts != null)) return data;

  // Fallback: aggregate from goods-receipts
  const receipts = await apiFetch<any[]>("/api/goods-receipts");
  if (receipts) {
    const total_receipts = receipts.length;
    const total_amount = receipts.reduce((s, r: any) => s + (r.total_cost ?? 0), 0);
    const total_paid = receipts.reduce((s, r: any) => s + (r.paid ?? 0), 0);
    return { total_receipts, total_quantity: 0, total_amount, total_paid, total_unpaid: total_amount - total_paid };
  }

  // Mock fallback
  return { total_receipts: 50, total_quantity: 500, total_amount: 500e6, total_paid: 350e6, total_unpaid: 150e6 };
}

export async function fetchPurchaseByTime(range: DateRange): Promise<{
  daily: PurchaseDailyData[];
  suppliers: SupplierPurchaseData[];
  products: ProductPurchaseData[];
  orders: PurchaseOrderData[];
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });

  const [timeData, supplierData, productData, orderData] = await Promise.all([
    apiFetch<any>(`/api/reports/purchases?${params}&group_by=time`),
    apiFetch<any>(`/api/reports/purchases?${params}&group_by=supplier`),
    apiFetch<any>(`/api/reports/purchases?${params}&group_by=product`),
    apiFetch<any>(`/api/reports/purchases?${params}&group_by=order`),
  ]);

  if (timeData?.daily) {
    return {
      daily: timeData.daily,
      suppliers: supplierData?.suppliers ?? mockSupplierData(),
      products: productData?.products ?? mockProductData(),
      orders: orderData?.orders ?? mockOrderData(),
    };
  }

  // Fallback to goods-receipts API
  const receipts = await apiFetch<any[]>("/api/goods-receipts");
  if (receipts) {
    const dailyMap = new Map<string, { receipt_count: number; total_amount: number }>();
    for (const r of receipts) {
      const day = (r.received_at ?? r.created_at ?? "").slice(0, 10);
      if (!dailyMap.has(day)) dailyMap.set(day, { receipt_count: 0, total_amount: 0 });
      const d = dailyMap.get(day)!;
      d.receipt_count++;
      d.total_amount += r.total_cost ?? 0;
    }
    const daily = Array.from(dailyMap.entries()).sort().map(([day, v]) => ({ day, receipt_count: v.receipt_count, total_amount: v.total_amount }));
    return { daily, suppliers: mockSupplierData(), products: mockProductData(), orders: receipts.map((r: any) => ({ code: r.code, supplier_name: r.supplier_name, staff: r.staff, received_at: r.received_at, receipt_status: r.receipt_status, total: r.total_cost, paid: r.paid ?? 0, unpaid: (r.total_cost ?? 0) - (r.paid ?? 0), item_count: 0 })) };
  }

  return {
    daily: mockDailyData(range.from, range.to),
    suppliers: mockSupplierData(),
    products: mockProductData(),
    orders: mockOrderData(),
  };
}

export async function fetchPurchaseBySupplier(range: DateRange): Promise<{
  suppliers: SupplierPurchaseData[];
  daily: { day: string; total_amount: number }[];
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const [supplierData, timeData] = await Promise.all([
    apiFetch<any>(`/api/reports/purchases?${params}&group_by=supplier`),
    apiFetch<any>(`/api/reports/purchases?${params}&group_by=time`),
  ]);

  if (supplierData?.suppliers) {
    return { suppliers: supplierData.suppliers, daily: (timeData?.daily ?? []).map((d: any) => ({ day: d.day, total_amount: d.total_amount })) };
  }

  const receipts = await apiFetch<any[]>("/api/goods-receipts");
  if (receipts) {
    const supplierMap = new Map<string, { receipt_count: number; total_amount: number; total_paid: number }>();
    for (const r of receipts) {
      const name = r.supplier_name ?? "Không xác định";
      if (!supplierMap.has(name)) supplierMap.set(name, { receipt_count: 0, total_amount: 0, total_paid: 0 });
      const s = supplierMap.get(name)!;
      s.receipt_count++;
      s.total_amount += r.total_cost ?? 0;
      s.total_paid += r.paid ?? 0;
    }
    const suppliers = Array.from(supplierMap.entries()).map(([supplier_name, v]) => ({ supplier_name, receipt_count: v.receipt_count, total_amount: v.total_amount, total_paid: v.total_paid, unpaid: v.total_amount - v.total_paid }));
    return { suppliers, daily: mockDailyData(range.from, range.to).map((d) => ({ day: d.day, total_amount: d.total_amount })) };
  }

  return { suppliers: mockSupplierData(), daily: mockDailyData(range.from, range.to).map((d) => ({ day: d.day, total_amount: d.total_amount })) };
}

export async function fetchPurchaseByProduct(range: DateRange): Promise<{
  products: ProductPurchaseData[];
  daily: { day: string; total_qty: number; total_amount: number }[];
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/purchases?${params}&group_by=product`);

  if (data?.products) {
    return { products: data.products, daily: mockDailyData(range.from, range.to).map((d) => ({ day: d.day, total_qty: d.receipt_count * 10, total_amount: d.total_amount })) };
  }

  return { products: mockProductData(), daily: mockDailyData(range.from, range.to).map((d) => ({ day: d.day, total_qty: d.receipt_count * 10, total_amount: d.total_amount })) };
}

export async function fetchPurchaseByOrder(range: DateRange): Promise<{
  orders: PurchaseOrderData[];
  summary: { total_receipts: number; total_amount: number; completed: number; cancelled: number };
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/purchases?${params}&group_by=order`);

  if (data?.orders) {
    const orders = data.orders;
    const completed = orders.filter((o: any) => o.receipt_status === "completed" || o.receipt_status === "Hoàn thành").length;
    const cancelled = orders.filter((o: any) => o.receipt_status === "cancelled" || o.receipt_status === "Đã hủy").length;
    return {
      orders,
      summary: { total_receipts: orders.length, total_amount: orders.reduce((s: number, o: any) => s + (o.total ?? 0), 0), completed, cancelled },
    };
  }

  const receipts = await apiFetch<any[]>("/api/goods-receipts");
  if (receipts) {
    const orders = receipts.map((r: any) => ({ code: r.code, supplier_name: r.supplier_name, staff: r.staff, received_at: r.received_at, receipt_status: r.receipt_status, total: r.total_cost, paid: r.paid ?? 0, unpaid: (r.total_cost ?? 0) - (r.paid ?? 0), item_count: 0 }));
    return { orders, summary: { total_receipts: orders.length, total_amount: orders.reduce((s: number, o: any) => s + o.total, 0), completed: 0, cancelled: 0 } };
  }

  const mockOrders = mockOrderData();
  return { orders: mockOrders, summary: { total_receipts: mockOrders.length, total_amount: mockOrders.reduce((s, o) => s + o.total, 0), completed: Math.round(mockOrders.length * 0.7), cancelled: Math.round(mockOrders.length * 0.1) } };
}

export async function fetchPaymentByTime(range: DateRange): Promise<{
  daily: { day: string; total_paid: number; total_unpaid: number }[];
  payments: any[];
  summary: { total_amount: number; total_paid: number; total_unpaid: number };
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/purchases?${params}&group_by=payment_time`);

  if (data?.daily) {
    const total_paid = data.daily.reduce((s: number, d: any) => s + (d.total_paid ?? 0), 0);
    const total_unpaid = data.daily.reduce((s: number, d: any) => s + (d.total_unpaid ?? 0), 0);
    return { daily: data.daily, payments: [], summary: { total_amount: total_paid + total_unpaid, total_paid, total_unpaid } };
  }

  return { daily: mockPaymentDaily(range.from, range.to), payments: [], summary: { total_amount: 500e6, total_paid: 350e6, total_unpaid: 150e6 } };
}

export async function fetchPaymentByStaff(range: DateRange): Promise<{
  staff: { name: string; role: string; order_count: number; total: number; paid: number; unpaid: number }[];
  summary: { total_amount: number; total_paid: number; total_unpaid: number };
}> {
  const receipts = await apiFetch<any[]>("/api/goods-receipts");
  if (receipts) {
    const staffMap = new Map<string, { name: string; total: number; paid: number }>();
    for (const r of receipts) {
      const name = r.staff ?? "Không xác định";
      if (!staffMap.has(name)) staffMap.set(name, { name, total: 0, paid: 0 });
      const s = staffMap.get(name)!;
      s.total += r.total_cost ?? 0;
      s.paid += r.paid ?? 0;
    }
    const staff = Array.from(staffMap.entries()).map(([name, v]) => ({ name, role: "Nhân viên", order_count: Math.round(1 + Math.random() * 20), total: v.total, paid: v.paid, unpaid: v.total - v.paid }));
    return { staff, summary: { total_amount: staff.reduce((s, st) => s + st.total, 0), total_paid: staff.reduce((s, st) => s + st.paid, 0), total_unpaid: staff.reduce((s, st) => s + st.unpaid, 0) } };
  }

  const mockStaff = [
    { name: "Nguyễn Văn A", role: "Nhân viên kho", order_count: 15, total: 200e6, paid: 140e6, unpaid: 60e6 },
    { name: "Trần Thị B", role: "Nhân viên mua hàng", order_count: 12, total: 150e6, paid: 105e6, unpaid: 45e6 },
    { name: "Lê Văn C", role: "Quản lý kho", order_count: 10, total: 120e6, paid: 84e6, unpaid: 36e6 },
  ];
  return { staff: mockStaff, summary: { total_amount: 470e6, total_paid: 329e6, total_unpaid: 141e6 } };
}

export async function fetchPaymentByMethod(range: DateRange): Promise<{
  methods: { method: string; payment_count: number; total_paid: number }[];
  summary: { total_amount: number; total_paid: number };
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/purchases?${params}&group_by=payment_method`);

  if (data?.methods) {
    const total_paid = data.methods.reduce((s: number, m: any) => s + (m.total_paid ?? 0), 0);
    return { methods: data.methods, summary: { total_amount: total_paid, total_paid } };
  }

  return { methods: mockPaymentMethodData(), summary: { total_amount: 500e6, total_paid: 350e6 } };
}

export async function fetchPaymentByBranch(range: DateRange): Promise<{
  branches: { branch: string; receipt_count: number; total_amount: number; total_paid: number; unpaid: number }[];
  summary: { total_amount: number; total_paid: number; total_unpaid: number };
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/purchases?${params}&group_by=payment_branch`);

  if (data?.branches) {
    const total_amount = data.branches.reduce((s: number, b: any) => s + (b.total_amount ?? 0), 0);
    const total_paid = data.branches.reduce((s: number, b: any) => s + (b.total_paid ?? 0), 0);
    return { branches: data.branches, summary: { total_amount, total_paid, total_unpaid: total_amount - total_paid } };
  }

  return { branches: mockPaymentBranchData(), summary: { total_amount: 500e6, total_paid: 350e6, total_unpaid: 150e6 } };
}

// ─── Inventory Reports ───────────────────────────────────────────────────────

export interface InventorySummary {
  total_products: number;
  total_stock: number;
  total_value: number;
}

export interface InventoryDetailItem {
  id: string;
  product_name: string;
  sku: string;
  category_name: string;
  branch: string;
  available_quantity: number;
  reserved_quantity: number;
  cost_price: number;
  total_value: number;
  status: string;
}

export async function fetchInventorySummary(): Promise<InventorySummary> {
  const data = await apiFetch<any>("/api/reports/inventory?group_by=summary");
  if (data && !data.error && (data.total_products != null)) return data;

  const products = await apiFetch<any[]>("/api/products");
  if (products) {
    return { total_products: products.length, total_stock: products.reduce((s, p: any) => s + (p.total_inventory ?? 0), 0), total_value: products.reduce((s, p: any) => s + ((p.total_inventory ?? 0) * (p.cost_price ?? 0)), 0) };
  }

  return { total_products: 50, total_stock: 5000, total_value: 250e6 };
}

export async function fetchInventoryDetail(range: DateRange): Promise<{
  items: InventoryDetailItem[];
  summary: { total_quantity: number; total_reserved: number; total_value: number };
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/inventory?${params}&group_by=detail`);

  if (data?.items) {
    const items = data.items;
    return {
      items,
      summary: {
        total_quantity: items.reduce((s: number, i: any) => s + (i.available_quantity ?? 0), 0),
        total_reserved: items.reduce((s: number, i: any) => s + (i.reserved_quantity ?? 0), 0),
        total_value: items.reduce((s: number, i: any) => s + (i.total_value ?? 0), 0),
      },
    };
  }

  const products = await apiFetch<any>("/api/inventory/products");
  if (products?.products) {
    const items = products.products.slice(0, 20).map((p: any) => ({
      id: p.id, product_name: p.name, sku: p.sku, category_name: p.category_name, branch: "Chi nhánh mặc định",
      available_quantity: p.total_inventory ?? 0, reserved_quantity: 0, cost_price: p.cost_price ?? 0, total_value: ((p.total_inventory ?? 0) * (p.cost_price ?? 0)), status: p.status,
    }));
    return { items, summary: { total_quantity: items.reduce((s: number, i: typeof items[0]) => s + i.available_quantity, 0), total_reserved: 0, total_value: items.reduce((s: number, i: typeof items[0]) => s + i.total_value, 0) } };
  }

  return { items: mockInventoryDetail(), summary: { total_quantity: 2000, total_reserved: 100, total_value: 250e6 } };
}

export async function fetchInventoryLedger(range: DateRange): Promise<{
  entries: any[];
  summary: { total_import: number; total_export: number; total_count: number };
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/inventory?${params}&group_by=ledger`);

  if (data?.entries) {
    const entries = data.entries;
    return {
      entries,
      summary: {
        total_import: entries.filter((e: any) => e.type === "Nhập kho" || e.type === "import").reduce((s: number, e: any) => s + Math.abs(e.quantity), 0),
        total_export: entries.filter((e: any) => e.type === "Xuất kho" || e.type === "export").reduce((s: number, e: any) => s + Math.abs(e.quantity), 0),
        total_count: entries.length,
      },
    };
  }

  return { entries: [], summary: { total_import: 2000, total_export: 1500, total_count: 50 } };
}

export async function fetchBelowThreshold(range: DateRange): Promise<{
  items: any[];
  summary: { total_shortage: number; total_count: number };
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/inventory?${params}&group_by=below_threshold`);

  if (data?.items) {
    const items = data.items;
    return { items, summary: { total_shortage: items.reduce((s: number, i: any) => s + (i.shortage ?? 0), 0), total_count: items.length } };
  }

  return { items: mockBelowThreshold(), summary: { total_shortage: 200, total_count: 10 } };
}

export async function fetchAboveThreshold(range: DateRange): Promise<{
  items: any[];
  summary: { total_excess: number; capital_locked: number };
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/inventory?${params}&group_by=above_threshold`);

  if (data?.items) {
    const items = data.items;
    return { items, summary: { total_excess: items.reduce((s: number, i: any) => s + (i.excess ?? 0), 0), capital_locked: items.reduce((s: number, i: any) => s + (i.capital_locked ?? 0), 0) } };
  }

  return { items: mockAboveThreshold(), summary: { total_excess: 300, capital_locked: 50e6 } };
}

export async function fetchInOutBalance(range: DateRange): Promise<{
  items: any[];
  daily: any[];
  summary: { total_beginning: number; total_import: number; total_export: number; total_ending: number };
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/inventory?${params}&group_by=in_out`);

  if (data?.items) {
    return {
      items: data.items,
      daily: mockDailyData(range.from, range.to).map((d) => ({ day: d.day, import: d.receipt_count * 10, export: Math.round(d.receipt_count * 8), ending: d.receipt_count * 50 })),
      summary: { total_beginning: 1000, total_import: data.items.reduce((s: number, i: any) => s + (i.import_qty ?? 0), 0), total_export: 0, total_ending: 1000 },
    };
  }

  return {
    items: mockProductData().slice(0, 10).map((p) => ({ ...p, beginning_balance: Math.round(p.total_qty * 0.8), import_qty: Math.round(p.total_qty * 0.2), export_qty: Math.round(p.total_qty * 0.15), ending_balance: Math.round(p.total_qty * 0.85) })),
    daily: mockDailyData(range.from, range.to).map((d) => ({ day: d.day, import: d.receipt_count * 10, export: Math.round(d.receipt_count * 8), ending: d.receipt_count * 50 })),
    summary: { total_beginning: 1000, total_import: 500, total_export: 300, total_ending: 1200 },
  };
}

export async function fetchStockCheck(range: DateRange): Promise<{
  checks: any[];
  summary: { total_checks: number; completed: number };
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/inventory?${params}&group_by=stock_check`);

  if (data?.checks) {
    const checks = data.checks;
    return { checks, summary: { total_checks: checks.length, completed: checks.filter((c: any) => c.status === "Hoàn thành" || c.status === "completed").length } };
  }

  const checks = await apiFetch<any[]>("/api/stock-checks");
  if (checks) {
    return { checks: checks.slice(0, 20).map((c: any) => ({ code: c.code, branch: c.branch, staff: c.staff, status: c.status, total_items: c.total_items, variance_items: c.variance_items, created_at: c.created_at })), summary: { total_checks: checks.length, completed: checks.filter((c: any) => c.status === "completed" || c.status === "balanced").length } };
  }

  return { checks: mockStockCheck(), summary: { total_checks: 15, completed: 10 } };
}
