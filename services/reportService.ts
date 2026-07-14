/**
 * Client-side service layer for report pages.
 * Calls /api/reports/* routes → falls back to individual API routes → falls back to mock.
 */

export type DateRange = { from: string; to: string };

// ─── API calls ────────────────────────────────────────────────────────────────
// Không còn mock generator: mọi báo cáo chỉ hiển thị dữ liệu thật từ API
// (hoặc rỗng nếu chưa có dữ liệu) — không bao giờ tạo số liệu giả/ngẫu nhiên.

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

  return { total_receipts: 0, total_quantity: 0, total_amount: 0, total_paid: 0, total_unpaid: 0 };
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
      suppliers: supplierData?.suppliers ?? [],
      products: productData?.products ?? [],
      orders: orderData?.orders ?? [],
    };
  }

  // Fallback to goods-receipts API — daily tính thật từ list receipts, không
  // còn suppliers/products giả (mockSupplierData/mockProductData) như trước.
  const receipts = await apiFetch<any[]>("/api/goods-receipts");
  if (receipts) {
    const dailyMap = new Map<string, { receipt_count: number; total_amount: number }>();
    const supplierMap = new Map<string, { receipt_count: number; total_amount: number; total_paid: number }>();
    for (const r of receipts) {
      const day = (r.received_at ?? r.created_at ?? "").slice(0, 10);
      if (!dailyMap.has(day)) dailyMap.set(day, { receipt_count: 0, total_amount: 0 });
      const d = dailyMap.get(day)!;
      d.receipt_count++;
      d.total_amount += r.total_cost ?? 0;

      const name = r.supplier_name ?? "Không xác định";
      if (!supplierMap.has(name)) supplierMap.set(name, { receipt_count: 0, total_amount: 0, total_paid: 0 });
      const s = supplierMap.get(name)!;
      s.receipt_count++;
      s.total_amount += r.total_cost ?? 0;
      s.total_paid += r.paid ?? 0;
    }
    const daily = Array.from(dailyMap.entries()).sort().map(([day, v]) => ({ day, receipt_count: v.receipt_count, total_amount: v.total_amount }));
    const suppliers = Array.from(supplierMap.entries()).map(([supplier_name, v]) => ({ supplier_name, receipt_count: v.receipt_count, total_amount: v.total_amount, total_paid: v.total_paid, unpaid: v.total_amount - v.total_paid }));
    return {
      daily,
      suppliers,
      products: [],
      orders: receipts.map((r: any) => ({ code: r.code, supplier_name: r.supplier_name, staff: r.staff, received_at: r.received_at, receipt_status: r.receipt_status, total: r.total_cost, paid: r.paid ?? 0, unpaid: (r.total_cost ?? 0) - (r.paid ?? 0), item_count: 0 }))
    };
  }

  return { daily: [], suppliers: [], products: [], orders: [] };
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
    // daily tính thật từ chính list receipts vừa tải (fallback path — API
    // group_by=supplier lỗi nhưng /api/goods-receipts vẫn tải được).
    const dailyMap = new Map<string, number>();
    for (const r of receipts) {
      const day = (r.received_at ?? r.created_at ?? "").slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + (r.total_cost ?? 0));
    }
    const daily = Array.from(dailyMap.entries()).sort().map(([day, total_amount]) => ({ day, total_amount }));
    return { suppliers, daily };
  }

  return { suppliers: [], daily: [] };
}

export async function fetchPurchaseByProduct(range: DateRange): Promise<{
  products: ProductPurchaseData[];
  daily: { day: string; total_qty: number; total_amount: number }[];
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const [data, timeData] = await Promise.all([
    apiFetch<any>(`/api/reports/purchases?${params}&group_by=product`),
    apiFetch<any>(`/api/reports/purchases?${params}&group_by=time`),
  ]);

  if (data?.products) {
    // daily lấy từ group_by=time (thật) — trước đây luôn là mockDailyData()
    // dù nhánh "products" đã tải thành công.
    return {
      products: data.products,
      daily: (timeData?.daily ?? []).map((d: any) => ({ day: d.day, total_qty: d.total_qty ?? 0, total_amount: d.total_amount }))
    };
  }

  return { products: [], daily: [] };
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

  return { orders: [], summary: { total_receipts: 0, total_amount: 0, completed: 0, cancelled: 0 } };
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

  return { daily: [], payments: [], summary: { total_amount: 0, total_paid: 0, total_unpaid: 0 } };
}

export async function fetchPaymentByStaff(range: DateRange): Promise<{
  staff: { name: string; role: string; order_count: number; total: number; paid: number; unpaid: number }[];
  summary: { total_amount: number; total_paid: number; total_unpaid: number };
}> {
  // Trước đây group_by=payment_staff CHƯA từng được cài ở API (chỉ có trong
  // comment) — order_count luôn là Math.round(1 + Math.random()*20), hoặc tệ
  // hơn là rơi thẳng về danh sách viết cứng "Nguyễn Văn A"... Giờ API đã có
  // nhánh payment_staff thật (xem app/api/reports/purchases/route.ts).
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/purchases?${params}&group_by=payment_staff`);
  if (data?.staff) {
    const staff = data.staff as { name: string; role: string; order_count: number; total: number; paid: number; unpaid: number }[];
    return {
      staff,
      summary: {
        total_amount: staff.reduce((s, st) => s + st.total, 0),
        total_paid: staff.reduce((s, st) => s + st.paid, 0),
        total_unpaid: staff.reduce((s, st) => s + st.unpaid, 0)
      }
    };
  }

  const receipts = await apiFetch<any[]>("/api/goods-receipts");
  if (receipts) {
    const staffMap = new Map<string, { name: string; order_count: number; total: number; paid: number }>();
    for (const r of receipts) {
      const name = r.staff || "Không xác định";
      if (!staffMap.has(name)) staffMap.set(name, { name, order_count: 0, total: 0, paid: 0 });
      const s = staffMap.get(name)!;
      s.order_count++;
      s.total += r.total_cost ?? 0;
      s.paid += r.paid ?? 0;
    }
    const staff = Array.from(staffMap.entries()).map(([name, v]) => ({ name, role: "Nhân viên", order_count: v.order_count, total: v.total, paid: v.paid, unpaid: v.total - v.paid }));
    return { staff, summary: { total_amount: staff.reduce((s, st) => s + st.total, 0), total_paid: staff.reduce((s, st) => s + st.paid, 0), total_unpaid: staff.reduce((s, st) => s + st.unpaid, 0) } };
  }

  return { staff: [], summary: { total_amount: 0, total_paid: 0, total_unpaid: 0 } };
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

  return { methods: [], summary: { total_amount: 0, total_paid: 0 } };
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

  return { branches: [], summary: { total_amount: 0, total_paid: 0, total_unpaid: 0 } };
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

  return { total_products: 0, total_stock: 0, total_value: 0 };
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

  return { items: [], summary: { total_quantity: 0, total_reserved: 0, total_value: 0 } };
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

  return { entries: [], summary: { total_import: 0, total_export: 0, total_count: 0 } };
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

  return { items: [], summary: { total_shortage: 0, total_count: 0 } };
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

  return { items: [], summary: { total_excess: 0, capital_locked: 0 } };
}

export async function fetchInOutBalance(range: DateRange): Promise<{
  items: any[];
  daily: any[];
  summary: { total_beginning: number; total_import: number; total_export: number; total_ending: number };
}> {
  const params = new URLSearchParams({ date_from: range.from, date_to: range.to });
  const data = await apiFetch<any>(`/api/reports/inventory?${params}&group_by=in_out`);

  if (data?.items) {
    // Trước đây: daily luôn là mockDailyData() ngẫu nhiên, total_export luôn
    // = 0, total_beginning/total_ending luôn = 1000 — bất kể dữ liệu thật.
    // Giờ API /api/reports/inventory?group_by=in_out đã tính thật cả 2.
    return {
      items: data.items,
      daily: Array.isArray(data.daily) ? data.daily.map((d: any) => ({ day: d.day, import: d.import, export: d.export, ending: null })) : [],
      summary: data.summary ?? { total_beginning: 0, total_import: 0, total_export: 0, total_ending: 0 },
    };
  }

  return {
    items: [],
    daily: [],
    summary: { total_beginning: 0, total_import: 0, total_export: 0, total_ending: 0 },
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

  return { checks: [], summary: { total_checks: 0, completed: 0 } };
}
