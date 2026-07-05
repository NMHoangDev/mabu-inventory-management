import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";

export type PurchaseOrderStatus = "draft" | "pending" | "partial" | "completed" | "cancelled";

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  tax_code: string;
  address: string;
  ward: string;
  district: string;
  city: string;
  note: string;
  tags: string[];
  total_purchased: number;
  total_orders: number;
  last_order_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id?: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  ordered_qty: number;
  received_qty: number;
  unit_cost: number;
  discount: number;
  line_total: number;
  position: number;
  note: string;
}

export interface PurchaseOrder {
  id: string;
  code: string;
  supplier_id: string | null;
  supplier_name: string;
  supplier_phone: string;
  branch: string;
  staff: string;
  expected_date: string | null;
  note: string;
  tags: string[];
  status: PurchaseOrderStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  received_qty: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  invoice_document_id: string | null;
  items: PurchaseOrderItem[];
  linked_goods_receipts?: Array<{ id: string; code: string; receipt_status: string }>;
}

export interface PurchaseOrderListRow {
  id: string;
  code: string;
  supplier_id: string | null;
  supplier_name: string;
  supplier_phone: string;
  branch: string;
  staff: string;
  expected_date: string | null;
  status: PurchaseOrderStatus;
  total_quantity: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
  item_count: number;
}

const emptyItem = (): PurchaseOrderItem => ({
  product_id: null,
  sku: "",
  product_name: "",
  unit: "",
  image_url: "",
  ordered_qty: 0,
  received_qty: 0,
  unit_cost: 0,
  discount: 0,
  line_total: 0,
  position: 1,
  note: ""
});

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function str(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function rowToListRow(row: any): PurchaseOrderListRow {
  return {
    id: row.id,
    code: row.code,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name ?? "",
    supplier_phone: row.supplier_phone ?? "",
    branch: row.branch ?? "",
    staff: row.staff ?? "",
    expected_date: row.expected_date ? new Date(row.expected_date).toISOString() : null,
    status: row.status,
    total_quantity: num(row.total_quantity),
    total_amount: num(row.total),
    created_at: row.created_at,
    updated_at: row.updated_at,
    item_count: num(row.item_count)
  };
}

function rowToOrder(row: any, items: any[]): PurchaseOrder {
  return {
    id: row.id,
    code: row.code,
    supplier_id: row.supplier_id,
    supplier_name: str(row.supplier_name),
    supplier_phone: str(row.supplier_phone),
    branch: str(row.branch, "Chi nhánh mặc định"),
    staff: str(row.staff),
    expected_date: row.expected_date ? new Date(row.expected_date).toISOString() : null,
    note: str(row.note),
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status,
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    tax: num(row.tax),
    total: num(row.total),
    received_qty: num(row.received_qty),
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    invoice_document_id: row.invoice_document_id ?? null,
    items: items.map((it) => ({
      id: it.id,
      product_id: it.product_id,
      sku: str(it.sku),
      product_name: str(it.product_name),
      unit: str(it.unit),
      image_url: str(it.image_url),
      ordered_qty: num(it.ordered_qty),
      received_qty: num(it.received_qty),
      unit_cost: num(it.unit_cost),
      discount: num(it.discount),
      line_total: num(it.line_total),
      position: num(it.position) || 1,
      note: str(it.note)
    }))
  };
}

export async function listPurchaseOrders(): Promise<PurchaseOrderListRow[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const result = await pool.query(`
    select
      po.id,
      po.code,
      po.supplier_id,
      po.supplier_name,
      po.supplier_phone,
      po.branch,
      po.staff,
      po.expected_date,
      po.status,
      po.total,
      po.created_at,
      po.updated_at,
      coalesce(sum(i.ordered_qty), 0)::numeric as total_quantity,
      coalesce(count(i.id), 0)::int as item_count
    from purchase_orders po
    left join purchase_order_items i on i.purchase_order_id = po.id
    group by po.id
    order by po.created_at desc
  `);
  return result.rows.map(rowToListRow);
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const pool = getPool();

  // Detect UUID vs text-code to avoid "operator does not exist: text = uuid"
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const orderResult = isUuid
    ? await pool.query(`select * from purchase_orders where id = $1::uuid limit 1`, [id])
    : await pool.query(`select * from purchase_orders where code = $1 limit 1`, [id]);
  if (orderResult.rows.length === 0) return null;
  const itemsResult = await pool.query(
    `select * from purchase_order_items where purchase_order_id = $1 order by position asc, created_at asc`,
    [orderResult.rows[0].id]
  );
  const order = rowToOrder(orderResult.rows[0], itemsResult.rows);
  // Linked goods_receipts (for "Đã tạo đơn nhập hàng X" reference)
  const grRes = await pool.query(
    `select id, code, receipt_status
       from goods_receipts
      where purchase_order_id = $1
      order by created_at desc`,
    [order.id]
  );
  order.linked_goods_receipts = grRes.rows.map((r: any) => ({
    id: String(r.id),
    code: String(r.code),
    receipt_status: String(r.receipt_status)
  }));
  return order;
}

export async function getNextPurchaseOrderCode(): Promise<string> {
  if (!isDatabaseConfigured) return "OSN00001";
  await ensureDatabase();
  const pool = getPool();
  const result = await pool.query(`
    select code from purchase_orders
    where code ~ '^OSN[0-9]+$'
    order by length(code) desc, code desc
    limit 1
  `);
  if (result.rows.length === 0) return "OSN00001";
  const current = String(result.rows[0].code);
  const numPart = parseInt(current.replace(/\D/g, ""), 10);
  if (!Number.isFinite(numPart)) return "OSN00001";
  return `OSN${String(numPart + 1).padStart(5, "0")}`;
}

export interface CreatePurchaseOrderInput {
  supplier_id?: string | null;
  supplier_name?: string;
  supplier_phone?: string;
  branch?: string;
  staff?: string;
  expected_date?: string | null;
  note?: string;
  tags?: string[];
  status?: PurchaseOrderStatus;
  discount?: number;
  tax?: number;
  items: PurchaseOrderItem[];
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  if (!isDatabaseConfigured) {
    throw new Error("Database chưa được cấu hình (thiếu DATABASE_URL).");
  }
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Advisory lock tránh race condition khi generate code tự động.
    await client.query("select pg_advisory_xact_lock(hashtext('purchase_order_code'))");

    const code = await getNextPurchaseOrderCode();

    const items = (input.items ?? []).map((it, index) => {
      const orderedQty = num(it.ordered_qty);
      const unitCost = num(it.unit_cost);
      const discount = num(it.discount);
      const lineTotal = Math.max(orderedQty * unitCost - discount, 0);
      return {
        ...emptyItem(),
        ...it,
        ordered_qty: orderedQty,
        unit_cost: unitCost,
        discount,
        line_total: lineTotal,
        position: index + 1
      };
    });

    const subtotal = items.reduce((sum, it) => sum + num(it.ordered_qty) * num(it.unit_cost), 0);
    const itemDiscount = items.reduce((sum, it) => sum + num(it.discount), 0);
    const discount = input.discount != null ? num(input.discount) : itemDiscount;
    const tax = input.tax != null ? num(input.tax) : 0;
    const total = Math.max(subtotal - discount + tax, 0);
    const totalQty = items.reduce((sum, it) => sum + num(it.ordered_qty), 0);

    const orderResult = await client.query(
      `insert into purchase_orders (
        code, supplier_id, supplier_name, supplier_phone, branch, staff,
        expected_date, note, tags, status, subtotal, discount, tax, total, received_qty
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      returning *`,
      [
        code,
        input.supplier_id ?? null,
        str(input.supplier_name),
        str(input.supplier_phone),
        str(input.branch, "Chi nhánh mặc định"),
        str(input.staff),
        input.expected_date ?? null,
        str(input.note),
        input.tags ?? [],
        input.status ?? "draft",
        subtotal,
        discount,
        tax,
        total,
        totalQty
      ]
    );

    const newOrder = orderResult.rows[0];

    for (const item of items) {
      if (!item.product_name && !item.sku) continue;
      await client.query(
        `insert into purchase_order_items (
          purchase_order_id, product_id, sku, product_name, unit, image_url,
          ordered_qty, received_qty, unit_cost, discount, line_total, position, note
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          newOrder.id,
          item.product_id,
          item.sku,
          item.product_name,
          item.unit,
          item.image_url,
          item.ordered_qty,
          item.received_qty,
          item.unit_cost,
          item.discount,
          item.line_total,
          item.position,
          item.note
        ]
      );
    }

    if (input.supplier_id) {
      await client.query(
        `update suppliers
           set total_orders = coalesce(total_orders, 0) + 1,
               total_purchased = coalesce(total_purchased, 0) + $1,
               last_order_at = now(),
               updated_at = now()
         where id = $2`,
        [total, input.supplier_id]
      ).catch(() => undefined);
    }

    await client.query("commit");

    const result = await getPurchaseOrder(newOrder.id);
    if (!result) throw new Error("Không tải được đơn đặt hàng vừa tạo.");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function searchSuppliers(query: string): Promise<Supplier[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const q = `%${query.trim()}%`;
  const result = await pool.query(
    `select * from suppliers
      where name ilike $1 or code ilike $1 or phone ilike $1 or tax_code ilike $1
      order by name asc
      limit 20`,
    [q]
  );
  return result.rows.map((row) => ({
    id: row.id,
    code: str(row.code),
    name: str(row.name),
    contact_name: str(row.contact_name),
    phone: str(row.phone),
    email: str(row.email),
    tax_code: str(row.tax_code),
    address: str(row.address),
    ward: str(row.ward),
    district: str(row.district),
    city: str(row.city),
    note: str(row.note),
    tags: Array.isArray(row.tags) ? row.tags : [],
    total_purchased: num(row.total_purchased),
    total_orders: num(row.total_orders),
    last_order_at: row.last_order_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

export async function createSupplier(input: Partial<Supplier>): Promise<Supplier> {
  if (!isDatabaseConfigured) throw new Error("Database chưa được cấu hình.");
  await ensureDatabase();
  const pool = getPool();
  const result = await pool.query(
    `insert into suppliers (
      code, name, contact_name, phone, email, tax_code,
      address, ward, district, city, note, tags
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    returning *`,
    [
      str(input.code),
      str(input.name, "Nhà cung cấp mới"),
      str(input.contact_name),
      str(input.phone),
      str(input.email),
      str(input.tax_code),
      str(input.address),
      str(input.ward),
      str(input.district),
      str(input.city),
      str(input.note),
      input.tags ?? []
    ]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    code: str(row.code),
    name: str(row.name),
    contact_name: str(row.contact_name),
    phone: str(row.phone),
    email: str(row.email),
    tax_code: str(row.tax_code),
    address: str(row.address),
    ward: str(row.ward),
    district: str(row.district),
    city: str(row.city),
    note: str(row.note),
    tags: Array.isArray(row.tags) ? row.tags : [],
    total_purchased: num(row.total_purchased),
    total_orders: num(row.total_orders),
    last_order_at: row.last_order_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function searchProducts(query: string) {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const q = `%${query.trim()}%`;
  const result = await pool.query(
    `select
       p.id,
       p.sku,
       p.name,
       p.status,
       p.image_url,
       coalesce(string_agg(distinct pv.unit, ', '), '') as units,
       coalesce(min(pv.cost_price), 0)::numeric as default_cost
     from products p
     left join product_variants pv on pv.product_id = p.id
     where p.sku ilike $1 or p.name ilike $1 or p.barcode ilike $1
     group by p.id
     order by p.name asc
     limit 20`,
    [q]
  );
  return result.rows.map((row) => ({
    id: row.id,
    sku: str(row.sku),
    name: str(row.name),
    status: str(row.status),
    image_url: str(row.image_url),
    units: str(row.units),
    default_cost: num(row.default_cost)
  }));
}
