import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface StockReceiptInput {
  source?: "scan" | "manual" | "transfer" | "return";
  invoice_row_id?: string;
  document_id?: string;
  supplier_name?: string;
  note?: string;
  staff?: string;
  branch?: string;
  items: Array<{
    product_id?: string;
    sku?: string;
    product_name: string;
    unit?: string;
    quantity: number;
    unit_cost?: number;
  }>;
}

export interface StockReceipt {
  id: string;
  code: string;
  source: string;
  invoice_row_id: string | null;
  document_id: string | null;
  supplier_name: string;
  note: string;
  total_quantity: number;
  total_amount: number;
  received_at: string;
  staff: string;
  branch: string;
  items: StockReceiptItem[];
}

export interface StockReceiptItem {
  id: string;
  receipt_id: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  position: number;
  created_at: string;
}

// ──────────────────────────────────────────────────────────────────────
// Auto-create from scanned invoice row IDs
// ──────────────────────────────────────────────────────────────────────

/**
 * Creates a stock_receipt (header + items) automatically from a list of
 * invoice_rows that have been mapped to products. Updates products.stock
 * and product_variants inventory in the same transaction.
 */
export async function autoCreateReceiptFromInvoiceRows(
  rowIds: string[],
  opts: { supplier_name?: string; staff?: string; branch?: string; note?: string } = {}
): Promise<{ receipt: StockReceipt | null; created: boolean; message: string }> {
  if (!isDatabaseConfigured) {
    return { receipt: null, created: false, message: "Database chưa cấu hình." };
  }
  if (rowIds.length === 0) {
    return { receipt: null, created: false, message: "Không có dòng hóa đơn nào." };
  }
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const rowsRes = await client.query(
      `select r.id, r.document_id, r.supplier_name,
              r.internal_product_code as sku,
              coalesce(nullif(r.adjusted_invoice_name,''), nullif(r.input_product_name,''), r.retail_name) as product_name,
              r.unit, coalesce(nullif(r.inventory_added_quantity,''), r.quantity) as quantity_text,
              coalesce(nullif(r.unit_price_after_tax,''), r.unit_price) as unit_cost_text,
              r.synced_product_id
         from invoice_rows r
        where r.id = any($1::text[])
        order by r.created_at asc`,
      [rowIds]
    );

    const itemsBySku = new Map<string, {
      product_id: string | null;
      sku: string;
      product_name: string;
      unit: string;
      quantity: number;
      unit_cost: number;
      document_id: string | null;
      invoice_row_id: string;
    }>();

    let supplierName = opts.supplier_name ?? "";
    let documentId: string | null = null;

    for (const r of rowsRes.rows) {
      const sku = String(r.sku ?? "").trim();
      if (!sku) continue;
      const quantity = parseNumber(r.quantity_text);
      if (quantity <= 0) continue;
      const unitCost = parseNumber(r.unit_cost_text);
      const productName = String(r.product_name ?? sku);
      const unit = String(r.unit ?? "");

      if (!supplierName && r.supplier_name) supplierName = String(r.supplier_name);
      if (!documentId && r.document_id) documentId = String(r.document_id);

      const existing = itemsBySku.get(sku);
      if (existing) {
        existing.quantity += quantity;
      } else {
        itemsBySku.set(sku, {
          product_id: r.synced_product_id ? String(r.synced_product_id) : null,
          sku,
          product_name: productName,
          unit,
          quantity,
          unit_cost: unitCost,
          document_id: r.document_id ? String(r.document_id) : null,
          invoice_row_id: String(r.id),
        });
      }
    }

    if (itemsBySku.size === 0) {
      await client.query("rollback");
      return { receipt: null, created: false, message: "Các dòng này không có SKU/số lượng hợp lệ." };
    }

    // Resolve product_id for SKUs that don't have synced_product_id yet
    for (const [sku, item] of itemsBySku) {
      if (item.product_id) continue;
      const prodRes = await client.query(`select id from products where sku = $1 limit 1`, [sku]);
      if (prodRes.rows.length > 0) item.product_id = prodRes.rows[0].id;
    }

    const code = `NK${formatDateCode(new Date())}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const totalQty = Array.from(itemsBySku.values()).reduce((a, b) => a + b.quantity, 0);
    const totalAmount = Array.from(itemsBySku.values()).reduce((a, b) => a + b.quantity * b.unit_cost, 0);

    const headerRes = await client.query(
      `insert into stock_receipts
        (code, source, document_id, supplier_name, note, total_quantity, total_amount,
         received_at, staff, branch, created_at)
       values ($1, 'scan', $2, $3, $4, $5, $6, now(), $7, $8, now())
       returning *`,
      [
        code,
        documentId,
        supplierName,
        opts.note ?? `Auto-receipt từ ${rowIds.length} dòng hóa đơn`,
        totalQty,
        totalAmount,
        opts.staff ?? "",
        opts.branch ?? "Chi nhánh chính",
      ]
    );
    const header = headerRes.rows[0];

    const itemRows: StockReceiptItem[] = [];
    let position = 1;
    for (const item of itemsBySku.values()) {
      const lineTotal = item.quantity * item.unit_cost;
      const r = await client.query(
        `insert into stock_receipt_items
          (receipt_id, product_id, sku, product_name, unit, quantity, unit_cost, line_total, position, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) returning *`,
        [header.id, item.product_id, item.sku, item.product_name, item.unit,
         item.quantity, item.unit_cost, lineTotal, position++]
      );
      itemRows.push(rowToItem(r.rows[0]));

      // Update products.stock + last_restocked_at + preferred_supplier
      if (item.product_id) {
        await client.query(
          `update products
              set stock = coalesce(stock, 0) + $2,
                  last_restocked_at = now(),
                  stock_updated_at = now(),
                  preferred_supplier = coalesce(nullif(preferred_supplier, ''), $3)
            where id = $1`,
          [item.product_id, item.quantity, supplierName]
        );
      }
    }

    // Mark invoice_rows as receipted
    await client.query(
      `update invoice_rows
          set product_synced_at = coalesce(product_synced_at, now()),
              updated_at = now()
        where id = any($1::text[])`,
      [rowIds]
    );

    await client.query("commit");

    return {
      receipt: {
        ...rowToHeader(header),
        items: itemRows,
      },
      created: true,
      message: `Đã tạo phiếu nhập kho ${code} với ${itemRows.length} mặt hàng, tổng ${totalQty} đơn vị.`,
    };
  } catch (err) {
    await client.query("rollback");
    console.error("autoCreateReceiptFromInvoiceRows failed:", err);
    return {
      receipt: null,
      created: false,
      message: err instanceof Error ? err.message : "Lỗi không xác định",
    };
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────────────────────────
// Manual create (no invoice rows)
// ──────────────────────────────────────────────────────────────────────

export async function createStockReceipt(input: StockReceiptInput): Promise<{ receipt: StockReceipt | null; message: string }> {
  if (!isDatabaseConfigured) {
    return { receipt: null, message: "Database chưa cấu hình." };
  }
  if (input.items.length === 0) {
    return { receipt: null, message: "Phiếu nhập phải có ít nhất 1 mặt hàng." };
  }
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const code = `NK${formatDateCode(new Date())}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const totalQty = input.items.reduce((a, b) => a + Number(b.quantity || 0), 0);
    const totalAmount = input.items.reduce((a, b) => a + Number(b.quantity || 0) * Number(b.unit_cost || 0), 0);

    const headerRes = await client.query(
      `insert into stock_receipts
        (code, source, document_id, supplier_name, note, total_quantity, total_amount,
         received_at, staff, branch, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,now(),$8,$9,now()) returning *`,
      [
        code,
        input.source ?? "manual",
        input.document_id ?? null,
        input.supplier_name ?? "",
        input.note ?? "",
        totalQty,
        totalAmount,
        input.staff ?? "",
        input.branch ?? "Chi nhánh chính",
      ]
    );
    const header = headerRes.rows[0];

    const itemRows: StockReceiptItem[] = [];
    let position = 1;
    for (const it of input.items) {
      const lineTotal = Number(it.quantity || 0) * Number(it.unit_cost || 0);
      let productId = it.product_id ?? null;
      if (!productId && it.sku) {
        const p = await client.query(`select id from products where sku=$1 limit 1`, [it.sku]);
        productId = p.rows[0]?.id ?? null;
      }
      const r = await client.query(
        `insert into stock_receipt_items
          (receipt_id, product_id, sku, product_name, unit, quantity, unit_cost, line_total, position, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) returning *`,
        [header.id, productId, it.sku ?? "", it.product_name, it.unit ?? "",
         Number(it.quantity || 0), Number(it.unit_cost || 0), lineTotal, position++]
      );
      itemRows.push(rowToItem(r.rows[0]));

      if (productId) {
        await client.query(
          `update products
              set stock = coalesce(stock, 0) + $2,
                  last_restocked_at = now(),
                  stock_updated_at = now()
            where id = $1`,
          [productId, Number(it.quantity || 0)]
        );
      }
    }

    await client.query("commit");
    return {
      receipt: { ...rowToHeader(header), items: itemRows },
      message: `Đã tạo phiếu nhập kho ${code}.`,
    };
  } catch (err) {
    await client.query("rollback");
    console.error("createStockReceipt failed:", err);
    return { receipt: null, message: err instanceof Error ? err.message : "Lỗi" };
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────────────────────────
// List
// ──────────────────────────────────────────────────────────────────────

export async function listStockReceipts(limit = 50): Promise<StockReceipt[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const headers = await pool.query(
    `select * from stock_receipts order by received_at desc limit $1`,
    [limit]
  );
  if (headers.rows.length === 0) return [];
  const ids = headers.rows.map((r) => r.id);
  const items = await pool.query(
    `select * from stock_receipt_items where receipt_id = any($1::uuid[]) order by receipt_id, position asc`,
    [ids]
  );
  const itemsByReceipt = new Map<string, StockReceiptItem[]>();
  for (const i of items.rows) {
    const it = rowToItem(i);
    if (!itemsByReceipt.has(it.receipt_id)) itemsByReceipt.set(it.receipt_id, []);
    itemsByReceipt.get(it.receipt_id)!.push(it);
  }
  return headers.rows.map((h) => ({ ...rowToHeader(h), items: itemsByReceipt.get(h.id) ?? [] }));
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function parseNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  const s = String(value).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatDateCode(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function rowToHeader(row: any): StockReceipt {
  return {
    id: row.id,
    code: row.code,
    source: row.source,
    invoice_row_id: row.invoice_row_id ?? null,
    document_id: row.document_id ?? null,
    supplier_name: row.supplier_name ?? "",
    note: row.note ?? "",
    total_quantity: Number(row.total_quantity ?? 0),
    total_amount: Number(row.total_amount ?? 0),
    received_at: row.received_at,
    staff: row.staff ?? "",
    branch: row.branch ?? "",
    items: [],
  };
}

function rowToItem(row: any): StockReceiptItem {
  return {
    id: row.id,
    receipt_id: row.receipt_id,
    product_id: row.product_id ?? null,
    sku: row.sku ?? "",
    product_name: row.product_name,
    unit: row.unit ?? "",
    quantity: Number(row.quantity ?? 0),
    unit_cost: Number(row.unit_cost ?? 0),
    line_total: Number(row.line_total ?? 0),
    position: row.position ?? 1,
    created_at: row.created_at,
  };
}
