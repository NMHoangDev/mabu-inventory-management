import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { cleanInvoiceProductName, parseNumeric } from "../shared/format";

// ──────────────────────────────────────────────────────────────────────
// SKU auto-generation helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Sinh SKU fallback khi user chọn "Sản phẩm này chưa có" mà không nhập SKU.
 * Format: `SKU-` + 6 ký tự base36 (timestamp ms) + 2 ký tự random.
 * Ví dụ: `SKU-lx9k4a-b7`.
 */
export function generateFallbackSku(): string {
  const ts = Date.now().toString(36).slice(-6);
  const rnd = Math.floor(Math.random() * 36 * 36)
    .toString(36)
    .padStart(2, "0")
    .slice(-2);
  return `SKU-${ts}${rnd}`.toUpperCase();
}

/**
 * Đảm bảo SKU unique trong bảng products. Nếu `candidate` đã tồn tại
 * → thêm hậu tố `-2`, `-3`, ... cho tới khi tìm được SKU chưa dùng.
 *
 * Chỉ SELECT (không INSERT). Caller dùng để check trước khi ghi vào DB.
 */
export async function ensureUniqueSku(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ sku?: string }> }> },
  candidate: string
): Promise<string> {
  let candidateSku = candidate;
  let attempt = 2;
  // Lặp tối đa 50 lần — nếu vẫn trùng (rất hiếm) → cuối cùng dùng timestamp ms
  // để đảm bảo không bao giờ NULL.
  while (attempt < 50) {
    const found = await client.query(
      `select sku from products where sku = $1 limit 1`,
      [candidateSku]
    );
    if (found.rows.length === 0) return candidateSku;
    candidateSku = `${candidate}-${attempt}`;
    attempt += 1;
  }
  return `${candidate}-${Date.now().toString(36)}`;
}

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
  // Dùng parseNumeric từ shared/format để handle đúng cả 2 dạng:
  // - "1.234.567,89" (VN: dấu chấm phân cách hàng nghìn, dấu phẩy decimal)
  // - "1,234,567.89" (US: dấu phẩy phân cách, dấu chấm decimal)
  // - "35163.72" (decimal đơn giản)
  // - "3516372" (integer)
  // Trước đây hàm này strip hết dấu chấm rồi thay "," → "." nên "35163.72"
  // bị thành 3516372 (off by 100x). BUG đã được fix.
  const parsed = parseNumeric(value);
  return parsed ?? 0;
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

// ──────────────────────────────────────────────────────────────────────
// Scan flow: confirmScanReceiptWithOptions
// Tạo PO + GR pending từ invoice_rows + decisions của user trên modal.
// ──────────────────────────────────────────────────────────────────────

export interface RowDecision {
  rowId: string;
  action: "add_stock" | "new";
  productId: string | null;
}

export interface ConfirmScanReceiptInput {
  documentId?: string;
  rowIds: string[];
  decisions: RowDecision[];
  supplier_name?: string;
  staff?: string;
  branch?: string;
  note?: string;
}

export interface ConfirmScanReceiptResult {
  success: boolean;
  message: string;
  purchaseOrderId: string | null;
  purchaseOrderCode: string | null;
  goodsReceiptId: string | null;
  goodsReceiptCode: string | null;
  createdProductIds: string[];
  receipt: { code: string; id: string } | null;
}

interface PreparedItem {
  invoice_row_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  created_product: boolean;
}

// Tạo mã NCC ổn định từ tên (slug chữ in hoa) — đảm bảo KHÔNG TRÙNG
// `suppliers.code` (UNIQUE). Chiến lược:
//
//   1. Slug tên → NCC-XXXX (vd tên "Phan Văn Vũ" → "NCC-PHANVANVU").
//   2. SELECT 1 để xem code đã tồn tại chưa. Nếu chưa → return.
//   3. Nếu trùng → thử NCC-XXXX-2, -3, ..., -99.
//   4. Nếu vẫn hết (hiếm) → NCC-XXXX-<timestamp8>.
//
// Mục tiêu: tránh được bug trước đó — mỗi lần scan tạo NCC cùng tên đều cố
// INSERT `NCC-PHANVANVU` 2+ lần → vi phạm `suppliers_code_key`. Cách fix này
// chạy trong transaction hiện tại (không cần race-lock vì UUID tên-supplier
// là idempotent: 2 concurrent insert cùng slug đều tìm thấy nó chưa tồn tại
// trước lúc 1 trong 2 INSERT xong, nên tối đa 1 conflict hết sức hiếm).
async function pickUniqueSupplierCode(client: any, name: string): Promise<string> {
  const trimmed = String(name ?? "").trim();
  const base = trimmed
    ? `NCC-${trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8) || "X"}`
    : `NCC${Date.now().toString().slice(-6)}`;

  const tryInsert = async (code: string): Promise<boolean> => {
    const probe = await client.query(`select 1 from suppliers where code = $1 limit 1`, [code]);
    return probe.rows.length === 0;
  };

  if (await tryInsert(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}`;
    if (await tryInsert(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString().slice(-8)}`;
}

export async function confirmScanReceiptWithOptions(
  input: ConfirmScanReceiptInput
): Promise<ConfirmScanReceiptResult> {
  const emptyFail = (message: string): ConfirmScanReceiptResult => ({
    receipt: null,
    purchaseOrderId: null,
    purchaseOrderCode: null,
    goodsReceiptId: null,
    goodsReceiptCode: null,
    createdProductIds: [],
    message,
    success: false
  });

  if (!isDatabaseConfigured) return emptyFail("Database chưa cấu hình.");
  if (!Array.isArray(input.rowIds) || input.rowIds.length === 0) {
    return emptyFail("Không có dòng hóa đơn nào.");
  }
  if (!Array.isArray(input.decisions) || input.decisions.length === 0) {
    return emptyFail("Chưa chọn quyết định cho dòng nào.");
  }

  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const rowsRes = await client.query(
      `select r.id, r.document_id, r.supplier_name,
              r.internal_product_code as sku,
              coalesce(nullif(r.adjusted_invoice_name,''), nullif(r.input_product_name,''), r.retail_name) as raw_product_name,
              r.unit, coalesce(nullif(r.inventory_added_quantity,''), r.quantity) as quantity_text,
              coalesce(nullif(r.unit_price_after_tax,''), r.unit_price) as unit_cost_text,
              r.synced_product_id
         from invoice_rows r
        where r.id = any($1::text[])
        order by r.created_at asc`,
      [input.rowIds]
    );

    const decisionMap = new Map<string, RowDecision>();
    for (const d of input.decisions) {
      if (!d || !d.rowId) continue;
      decisionMap.set(String(d.rowId), d);
    }

    let supplierName = (input.supplier_name ?? "").trim();
    if (!supplierName) {
      for (const r of rowsRes.rows) {
        const sn = String(r.supplier_name ?? "").trim();
        if (sn) {
          supplierName = sn;
          break;
        }
      }
    }
    let supplierId: string | null = null;
    if (supplierName) {
      const found = await client.query(
        `select id from suppliers where lower(name) = lower($1) limit 1`,
        [supplierName]
      );
      if (found.rows.length > 0) {
        supplierId = String(found.rows[0].id);
      } else {
        const code = await pickUniqueSupplierCode(client, supplierName);
        const created = await client.query(
          `insert into suppliers (code, name, status)
           values ($1, $2, 'active')
           returning id`,
          [code, supplierName]
        );
        supplierId = String(created.rows[0].id);
      }
    }

    const prepared: PreparedItem[] = [];
    const createdProductIds: string[] = [];
    let documentId: string | null = input.documentId ?? null;
    const processedRowIds: string[] = [];

    for (const r of rowsRes.rows) {
      const rowId = String(r.id);
      const decision = decisionMap.get(rowId);
      if (!decision) continue;

      let sku = String(r.sku ?? "").trim();
      const quantity = parseNumber(r.quantity_text);
      const unitCost = parseNumber(r.unit_cost_text);
      const productName = cleanInvoiceProductName(String(r.raw_product_name ?? sku ?? "").trim());
      const unit = String(r.unit ?? "").trim();

      if (quantity <= 0 || !productName) continue;
      if (documentId === null && r.document_id) documentId = String(r.document_id);

      // Nếu user chọn "Sản phẩm này chưa có" (action=new) mà không nhập SKU
      // → auto-generate SKU unique. Đảm bảo mỗi sản phẩm tạo mới có mã định danh
      // đầy đủ để PO/GR items có sku != NULL (tránh empty SKU ở bước sau).
      if (!sku) {
        sku = await ensureUniqueSku(client, generateFallbackSku());
      }

      let productId: string | null = null;
      let createdProduct = false;
      let resolvedProductName = productName;

      if (decision.action === "add_stock") {
        const candidateId = decision.productId
          ? String(decision.productId)
          : r.synced_product_id
            ? String(r.synced_product_id)
            : null;
        if (candidateId) {
          const prodExists = await client.query(
            `select id from products where id = $1::uuid limit 1`,
            [candidateId]
          );
          if (prodExists.rows.length > 0) {
            productId = candidateId;
          }
        }
        if (!productId && sku) {
          const found = await client.query(`select id from products where sku = $1 limit 1`, [sku]);
          if (found.rows.length > 0) productId = String(found.rows[0].id);
        }
        if (!productId) {
          const insertProd = await client.query(
            `insert into products
              (name, sku, unit, cost_price, price, track_inventory, status)
             values ($1, $2, $3, $4, 0, true, 'active')
             returning id`,
            [productName, sku || null, unit || null, unitCost]
          );
          productId = String(insertProd.rows[0].id);
          createdProduct = true;
          createdProductIds.push(productId);
        }
        // Resolve product + name + sku in one query.
        // QUAN TRỌNG: copy SKU từ product đã resolve nếu invoice_row.sku rỗng.
        // Nếu không copy, purchase_order_items.sku và goods_receipt_items.sku
        // sẽ = '' khi user chọn "Đã có sản phẩm" qua dropdown mà không tự gõ SKU.
        const prodRes = await client.query(
          `select name, sku from products where id = $1 limit 1`,
          [productId]
        );
        resolvedProductName = String(prodRes.rows[0]?.name || productName);
        if (!sku) {
          sku = String(prodRes.rows[0]?.sku ?? "").trim();
        }
      } else {
        if (sku) {
          const dup = await client.query(`select id from products where sku = $1 limit 1`, [sku]);
          if (dup.rows.length > 0) {
            productId = String(dup.rows[0].id);
          }
        }
        if (!productId) {
          const insertProd = await client.query(
            `insert into products
              (name, sku, unit, cost_price, price, track_inventory, status)
             values ($1, $2, $3, $4, 0, true, 'active')
             returning id`,
            [productName, sku || null, unit || null, unitCost]
          );
          productId = String(insertProd.rows[0].id);
          createdProduct = true;
          createdProductIds.push(productId);
        }
      }

      prepared.push({
        invoice_row_id: rowId,
        product_id: productId!,
        sku,
        product_name: resolvedProductName,
        unit,
        quantity,
        unit_cost: unitCost,
        line_total: quantity * unitCost,
        created_product: createdProduct
      });
      processedRowIds.push(rowId);
    }

    if (prepared.length === 0) {
      await client.query("rollback");
      return emptyFail("Tất cả dòng đã chọn đều không hợp lệ (thiếu SKU/số lượng).");
    }

    // Tự động gắn sản phẩm ↔ nhà cung cấp (product_suppliers) — nhà cung cấp
    // đã resolve/match theo tên hóa đơn ở trên (dòng ~578). Trước đây bảng
    // này chỉ ghi được qua UI thủ công (AddSupplierModal/trang chi tiết NCC)
    // nên gần như luôn rỗng dù nhập hàng liên tục. Không chặn luồng tạo đơn
    // nhập nếu bước này lỗi — chỉ là dữ liệu bổ sung, không phải nghiệp vụ lõi.
    if (supplierId) {
      const productIds = Array.from(new Set(prepared.map((p) => p.product_id)));
      await client
        .query(
          `insert into product_suppliers (product_id, supplier_id)
           select unnest($2::uuid[]), $1::uuid
           on conflict (product_id, supplier_id) do nothing`,
          [supplierId, productIds]
        )
        .catch(() => undefined);
    }

    const poCodeRes = await client.query(
      `select code from purchase_orders where code ~ '^OSN[0-9]+$'
        order by length(code) desc, code desc limit 1`
    );
    let poCode = "OSN00001";
    if (poCodeRes.rows.length > 0) {
      const cur = String(poCodeRes.rows[0].code);
      const numPart = parseInt(cur.replace(/\D/g, ""), 10);
      if (Number.isFinite(numPart)) poCode = `OSN${String(numPart + 1).padStart(5, "0")}`;
    }

    const subtotal = prepared.reduce((s, it) => s + it.line_total, 0);
    const totalQty = prepared.reduce((s, it) => s + it.quantity, 0);
    const staff = (input.staff ?? "").trim();
    const branch = (input.branch ?? "").trim() || "Chi nhánh chính";

    const poInsert = await client.query(
      `insert into purchase_orders
        (code, supplier_id, supplier_name, supplier_phone, branch, staff,
         expected_date, note, tags, status, subtotal, discount, tax, total, received_qty,
         invoice_document_id)
       values ($1,$2,$3,'',$4,$5,null,$6,'{}'::text[],'pending',$7,0,0,$8,$9,$10)
       returning *`,
      [
        poCode,
        supplierId,
        supplierName,
        branch,
        staff,
        input.note ?? `Auto-PO từ scan (${prepared.length} mặt hàng)`,
        subtotal,
        subtotal,
        0,
        documentId ? String(documentId) : null
      ]
    );
    const po = poInsert.rows[0];

    let position = 1;
    for (const it of prepared) {
      await client.query(
        `insert into purchase_order_items
          (purchase_order_id, product_id, sku, product_name, unit, image_url,
           ordered_qty, received_qty, unit_cost, discount, line_total, position, note)
         values ($1,$2,$3,$4,$5,'',$6,$6,$7,0,$8,$9,'')`,
        [
          po.id,
          it.product_id,
          it.sku,
          it.product_name,
          it.unit,
          it.quantity,
          it.unit_cost,
          it.line_total,
          position++
        ]
      );
    }

    if (supplierId) {
      await client.query(
        `update suppliers
            set total_orders = coalesce(total_orders, 0) + 1,
                total_purchased = coalesce(total_purchased, 0) + $1,
                last_order_at = now(),
                updated_at = now()
          where id = $2`,
        [subtotal, supplierId]
      ).catch(() => undefined);
    }

    if (processedRowIds.length > 0) {
      for (const rowId of processedRowIds) {
        const matched = prepared.find((p) => p.invoice_row_id === rowId);
        const productIdForRow = matched?.product_id ?? null;
        await client.query(
          `update invoice_rows
              set product_synced_at = now(),
                  synced_product_id = coalesce(nullif(synced_product_id, ''), $2),
                  purchase_order_id = $3::uuid,
                  updated_at = now()
            where id = $1`,
          [String(rowId), productIdForRow ? String(productIdForRow) : "", String(po.id)]
        );
      }
    }

    let grId: string | null = null;
    let grCode: string | null = null;
    if (po.id) {
      const grCodeRes = await client.query(
        `select code from goods_receipts where code ~ '^PNH[0-9]+$'
          order by length(code) desc, code desc limit 1`
      );
      grCode = "PNH00001";
      if (grCodeRes.rows.length > 0) {
        const cur = String(grCodeRes.rows[0].code);
        const numPart = parseInt(cur.replace(/\D/g, ""), 10);
        if (Number.isFinite(numPart)) {
          grCode = `PNH${String(numPart + 1).padStart(5, "0")}`;
        }
      }
      const grInsert = await client.query(
        `insert into goods_receipts
          (code, supplier_id, supplier_name, supplier_phone, purchase_order_id,
           purchase_order_code, branch, staff, note, tags,
           receipt_status, order_status, subtotal, discount, tax,
           total_cost, total_quantity, paid, payment_method, received_at)
         values ($1,$2,$3,'',$4,$5,$6,$7,$8,'{}'::text[],
                 'pending','pending',$9,0,0,$10,$11,0,'cash',now())
         returning id, code`,
        [
          grCode,
          supplierId,
          supplierName,
          po.id,
          poCode,
          branch,
          staff,
          `Tự động tạo từ đơn đặt hàng ${poCode} (scan hóa đơn).`,
          subtotal,
          subtotal,
          totalQty
        ]
      );
      grId = String(grInsert.rows[0].id);

      const poItemsRes = await client.query(
        `select * from purchase_order_items where purchase_order_id = $1::uuid order by position asc`,
        [po.id]
      );
      let grPos = 1;
      for (const it of poItemsRes.rows) {
        const orderedQty = Number(it.ordered_qty ?? 0);
        const unitCost = Number(it.unit_cost ?? 0);
        await client.query(
          `insert into goods_receipt_items
             (goods_receipt_id, purchase_order_item_id, product_id, sku, product_name,
              unit, image_url, ordered_qty, received_qty, unit_cost, discount,
              line_total, position, note, stock_added_at, created_at)
           values ($1,$2,$3,$4,$5,$6,'',$7,$7,$8,0,$9,$10,'',NULL,now())`,
          [
            grId,
            it.id,
            it.product_id ?? null,
            it.sku ?? "",
            it.product_name ?? "",
            it.unit ?? "",
            orderedQty,
            unitCost,
            Number(it.line_total ?? orderedQty * unitCost),
            grPos++
          ]
        );
      }

      if (processedRowIds.length > 0) {
        await client.query(
          `update invoice_rows
              set goods_receipt_id = $2::uuid,
                  updated_at = now()
            where purchase_order_id = $1::uuid`,
          [po.id, grId]
        );
      }
    }

    await client.query("commit");

    return {
      purchaseOrderId: String(po.id),
      purchaseOrderCode: poCode,
      goodsReceiptId: grId,
      goodsReceiptCode: grCode,
      createdProductIds,
      receipt: null,
      message: `Đã tạo đơn đặt hàng nhập ${poCode} với ${prepared.length} mặt hàng, tổng ${totalQty} đơn vị. Đơn nhập hàng pending đã được tạo sẵn — vào chi tiết GR và bấm "Hoàn thành" để cộng tồn kho.`,
      success: true
    };
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    console.error("confirmScanReceiptWithOptions failed:", err);
    return {
      receipt: null,
      goodsReceiptId: null,
      goodsReceiptCode: null,
      purchaseOrderId: null,
      purchaseOrderCode: null,
      createdProductIds: [],
      message: err instanceof Error ? err.message : "Lỗi không xác định",
      success: false
    };
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────────────────────────
// transitionGoodsReceiptStatus
// ──────────────────────────────────────────────────────────────────────

// Đồng bộ tồn kho cho UI "Khả dụng".
//
// UI tồn kho khả dụng trên trang `/products` được tính từ bảng
// `inventory_levels` (qua JOIN `product_variants` + `locations`),
// KHÔNG đọc trực tiếp từ `products.stock`. Vì thế, nếu chỉ update
// `products.stock` thì số "Khả dụng" trên UI vẫn = 0 (gây hiểu nhầm đã
// nhập hàng mà không cộng kho).
//
// Helper này đảm bảo mỗi product có (1) 1 `product_variants` mặc định
// và (2) 1 `inventory_levels` ở location mặc định, rồi cộng/trừ
// `quantity` theo `delta` (>0 khi nhập, <0 khi rollback). Đồng thời
// cập nhật kèm `products.stock` để các màn-đồ-thị khác (dashboard,
// báo cáo) vẫn nhìn thấy tồn.
export async function applyInventoryLevelDelta(
  client: any,
  productId: string,
  delta: number,
  logTag: string
): Promise<{ variantId: string; locationId: string; before: number; after: number; updated: boolean }> {
  if (!Number.isFinite(delta) || delta === 0) {
    return { variantId: "", locationId: "", before: 0, after: 0, updated: false };
  }

  const productRes = await client.query(
    `select id, sku, price from products where id = $1::uuid limit 1`,
    [productId]
  );
  if (productRes.rows.length === 0) {
    console.warn(`[inventory-level] Bỏ qua ${logTag}: product ${productId} không tồn tại.`);
    return { variantId: "", locationId: "", before: 0, after: 0, updated: false };
  }
  const product = productRes.rows[0];

  // 1. Get/create default variant
  let variantId: string;
  const variantRes = await client.query(
    `select id from product_variants where product_id = $1::uuid order by position asc limit 1`,
    [productId]
  );
  if (variantRes.rows.length > 0) {
    variantId = String(variantRes.rows[0].id);
  } else {
    const sku = String(product.sku ?? "").trim() || `SKU-${String(productId).slice(0, 8)}`;
    const inserted = await client.query(
      `insert into product_variants (product_id, title, sku, price, cost_price, position, created_at, updated_at)
       values ($1::uuid, 'Mặc định', $2, $3, 0, 1, now(), now())
       returning id`,
      [productId, sku, Number(product.price ?? 0)]
    );
    variantId = String(inserted.rows[0].id);
  }

  // 2. Get/create default location
  let locationId: string;
  const locRes = await client.query(
    `select id from locations order by is_default desc, created_at asc limit 1`
  );
  if (locRes.rows.length > 0) {
    locationId = String(locRes.rows[0].id);
  } else {
    const inserted = await client.query(
      `insert into locations (name, is_default, is_active, created_at, updated_at)
       values ('Cửa hàng chính', true, true, now(), now())
       returning id`
    );
    locationId = String(inserted.rows[0].id);
  }

  // 3. Cộng/trừ quantity, không cho âm (an toàn khi đồng bộ ngược tay).
  const beforeRes = await client.query(
    `select coalesce(quantity, 0)::numeric as qty
       from inventory_levels where variant_id = $1::uuid and location_id = $2::uuid`,
    [variantId, locationId]
  );
  const before = Number(beforeRes.rows[0]?.qty ?? 0);
  const target = Math.max(0, before + delta);

  if (before + delta < 0 && delta < 0) {
    console.warn(
      `[inventory-level] Cảnh báo ${logTag}: sẽ trừ ${Math.abs(delta)} nhưng chỉ có ${before} trong kho — kẹp về 0.`
    );
  }

  const upsertRes = await client.query(
    `insert into inventory_levels (variant_id, location_id, quantity, updated_at)
     values ($1::uuid, $2::uuid, $3, now())
     on conflict (variant_id, location_id) do update set
       quantity = greatest(0, excluded.quantity),
       updated_at = now()
     returning quantity`,
    [variantId, locationId, target]
  );
  const after = Number(upsertRes.rows[0]?.quantity ?? target);

  console.info(
    `[inventory-level] ${delta > 0 ? "+" : ""}${delta} (UI: ${before} → ${after}) variant=${variantId.slice(0, 8)} loc=${locationId.slice(0, 8)} ${logTag}`
  );

  return { variantId, locationId, before, after, updated: true };
}

// Cộng tồn kho cho các item CHƯA được cộng (`stock_added_at IS NULL`) của 1
// đơn nhập hàng. Idempotent — gọi nhiều lần chỉ cộng phần chưa cộng.
//
// Tách ra từ transitionGoodsReceiptStatus để dùng lại ở CẢ 2 nơi:
//   1. createGoodsReceipt (lib/goods-receipts/repository.ts) — khi tạo đơn
//      với receipt_status = 'completed' ngay từ đầu ("Tạo & nhập hàng"), phải
//      cộng tồn kho NGAY trong transaction tạo đơn. Trước đây KHÔNG gọi hàm
//      nào cả — status hiển thị "Hoàn thành" nhưng tồn kho không hề được
//      cộng, và nút cộng tồn kho thủ công (transitionStatus) lại bị ẩn trên
//      UI đúng lúc status đã completed → tồn kho không bao giờ được cộng.
//   2. transitionGoodsReceiptStatus — khi đổi trạng thái sang 'completed' sau
//      khi đơn đã tồn tại ở trạng thái khác (pending/in_progress).
export async function addStockForGoodsReceiptItems(
  client: any,
  goodsReceiptId: string,
  goodsReceiptCode: string
): Promise<{ stockAdded: boolean }> {
  let stockAdded = false;
  const itemsRes = await client.query(
    `select gri.id, gri.product_id, gri.received_qty, gri.sku, gri.product_name,
            gri.purchase_order_item_id, gri.unit_cost, gri.stock_added_at
       from goods_receipt_items gri
      where gri.goods_receipt_id = $1::uuid
      order by gri.position asc`,
    [goodsReceiptId]
  );

  for (const item of itemsRes.rows) {
    if (item.stock_added_at) continue;
    let productId: string | null = item.product_id ? String(item.product_id) : null;

    if (!productId) {
      const sku = String(item.sku ?? "").trim();
      if (sku) {
        const found = await client.query(
          `select id from products where sku = $1 limit 1`,
          [sku]
        );
        if (found.rows.length > 0) productId = String(found.rows[0].id);
      }
      if (!productId) {
        const cleanName = cleanInvoiceProductName(String(item.product_name ?? "").trim())
          || String(item.product_name ?? "").trim()
          || `Sản phẩm nhập từ GR ${String(item.id).slice(0, 8)}`;
        const unitCost = Number(item.unit_cost ?? 0);
        const stubCode = sku || `AUTO-${String(item.id).slice(0, 8).toUpperCase()}`;
        try {
          const inserted = await client.query(
            `insert into products
              (name, sku, unit, cost_price, price, track_inventory, status)
             values ($1, $2, '', $3, 0, true, 'active')
             returning id`,
            [cleanName, stubCode || null, unitCost]
          );
          productId = String(inserted.rows[0].id);
        } catch (err) {
          console.warn(
            `Không tạo được product stub cho GR item ${String(item.id)}:`,
            err instanceof Error ? err.message : err
          );
          continue;
        }
      }
      if (productId) {
        await client.query(
          `update goods_receipt_items set product_id = $2::uuid where id = $1`,
          [String(item.id), productId]
        );
      }
    }
    if (!productId) continue;

    const qty = Number(item.received_qty ?? 0);
    if (qty <= 0) continue;

    await client.query(
      `update products
          set stock = coalesce(stock, 0) + $2,
              last_restocked_at = now(),
              stock_updated_at = now(),
              updated_at = now()
        where id = $1`,
      [productId, qty]
    );
    // Đồng bộ sang inventory_levels để UI "Khả dụng" thấy tồn kho.
    await applyInventoryLevelDelta(
      client,
      productId,
      qty,
      `(GR ${goodsReceiptCode} · item ${String(item.id).slice(0, 8)})`
    );
    await client.query(
      `update goods_receipt_items set stock_added_at = now() where id = $1`,
      [String(item.id)]
    );
    stockAdded = true;
    console.info(
      `[stock] +${qty} → product ${productId} (GR ${goodsReceiptCode} · item ${String(item.id).slice(0, 8)})`
    );
  }

  return { stockAdded };
}

export async function transitionGoodsReceiptStatus(input: {
  goodsReceiptId: string;
  nextStatus: "pending" | "in_progress" | "completed" | "cancelled";
}): Promise<{ success: boolean; message: string; poStatus?: string; stockAdded?: boolean; stockReversed?: boolean }> {
  if (!isDatabaseConfigured) {
    return { success: false, message: "Database chưa cấu hình." };
  }
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const grRes = await client.query(
      `select id, receipt_status, purchase_order_id, code
         from goods_receipts where id = $1::uuid`,
      [input.goodsReceiptId]
    );
    if (grRes.rows.length === 0) {
      await client.query("rollback");
      return { success: false, message: "Không tìm thấy đơn nhập hàng." };
    }
    const gr = grRes.rows[0];

    const cur = String(gr.receipt_status);
    const next = input.nextStatus;
    const allowed: Record<string, string[]> = {
      pending: ["in_progress", "completed", "cancelled"],
      in_progress: ["completed", "cancelled", "pending"],
      completed: ["pending", "cancelled"],
      cancelled: ["pending"]
    };
    if (!allowed[cur]?.includes(next)) {
      await client.query("rollback");
      return { success: false, message: `Không thể đổi từ "${cur}" sang "${next}".` };
    }

    let stockAdded = false;
    let stockReversed = false;

    // ──────────────────────────────────────────────────────────────────────
    // Chiều đi xuôi → completed: cộng tồn kho cho từng item chưa được cộng.
    // Chiều đi ngược từ completed → pending/in_progress/cancelled: hoàn lại
    // tồn kho đã cộng + reset `stock_added_at = NULL` để lần sau cộng lại.
    // Trước đây thiếu khối hoàn lại, dẫn đến 2 bug:
    //   1) Sau khi đã complete 1 lần, hủy đơn không trừ tồn → tồn "ảo".
    //   2) Sau khi hoàn lại pending, complete lần 2 sẽ bị skip vì
    //      `stock_added_at` đã có giá trị → không cộng, dù user muốn.
    // ──────────────────────────────────────────────────────────────────────

    if (next === "completed") {
      const result = await addStockForGoodsReceiptItems(client, input.goodsReceiptId, String(gr.code));
      stockAdded = result.stockAdded;
    } else if (cur === "completed") {
      // Chiều đi ngược: hoàn lại tồn kho và reset `stock_added_at` để có thể
      // cộng lại ở lần complete kế tiếp. Chỉ xử lý các item đã cộng
      // (`stock_added_at IS NOT NULL`); những item chưa từng cộng thì bỏ qua.
      const itemsRes = await client.query(
        `select gri.id, gri.product_id, gri.received_qty, gri.stock_added_at
           from goods_receipt_items gri
          where gri.goods_receipt_id = $1::uuid
            and gri.stock_added_at is not null`,
        [input.goodsReceiptId]
      );

      for (const item of itemsRes.rows) {
        const productId = item.product_id ? String(item.product_id) : null;
        const qty = Number(item.received_qty ?? 0);
        if (!productId || qty <= 0) {
          // Reset marker để lần sau cộng lại còn productId chuẩn.
          await client.query(
            `update goods_receipt_items set stock_added_at = NULL where id = $1`,
            [String(item.id)]
          );
          continue;
        }

        // Trừ tồn kho nhưng không để âm dưới 0 (an toàn khi stock đã bị
        // thay đổi bởi thao tác khác). Nếu sản phẩm có `allow_negative_stock=false`
        // mà stock hiện tại nhỏ hơn qty thì giữ nguyên stock = 0 và log cảnh báo.
        const upd = await client.query(
          `update products
              set stock = greatest(0, coalesce(stock, 0) - $2),
                  stock_updated_at = now(),
                  updated_at = now()
            where id = $1
            returning stock`,
          [productId, qty]
        );
        const remaining = Number(upd.rows[0]?.stock ?? 0);

        // Đồng bộ sang inventory_levels (UI "Khả dụng") với delta = -qty.
        await applyInventoryLevelDelta(
          client,
          productId,
          -qty,
          `(rollback GR ${String(gr.code)} · item ${String(item.id).slice(0, 8)})`
        );

        await client.query(
          `update goods_receipt_items set stock_added_at = NULL where id = $1`,
          [String(item.id)]
        );
        stockReversed = true;
        console.info(
          `[stock] -${qty} ← product ${productId} (rollback từ GR ${String(gr.code)} · item ${String(item.id).slice(0, 8)}, tồn còn ${remaining})`
        );
      }
    }

    // Đồng bộ cả `receipt_status` (thanh toán) lẫn `order_status` (nhập hàng
    // thực tế) để UI không lệch giữa 2 cột. Cộng/rollback tồn kho vẫn dựa
    // trên `goods_receipt_items.stock_added_at` — không đụng ở đây.
    await client.query(
      `update goods_receipts
          set receipt_status = $2,
              order_status   = $2,
              completed_at   = case when $2 = 'completed' then now() else completed_at end,
              updated_at     = now()
        where id = $1`,
      [input.goodsReceiptId, next]
    );

    let poStatus: string | undefined;
    if (next === "completed" && gr.purchase_order_id) {
      await client.query(
        `update purchase_orders
            set status = 'completed', completed_at = now(), updated_at = now()
          where id = $1::uuid`,
        [String(gr.purchase_order_id)]
      );
      poStatus = "completed";
    }

    await client.query("commit");

    const msg =
      next === "completed"
        ? "Thanh toán hoàn thành. Đã cộng tồn kho."
        : cur === "completed" && (next === "pending" || next === "in_progress" || next === "cancelled")
          ? stockReversed
            ? `Đã đổi trạng thái sang "${next}". Đã hoàn lại tồn kho đã cộng trước đó.`
            : `Đã đổi trạng thái sang "${next}".`
          : next === "cancelled"
            ? "Đã hủy đơn nhập hàng."
            : `Đã cập nhật trạng thái sang "${next}".`;
    return { success: true, message: msg, poStatus, stockAdded, stockReversed };
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    console.error("transitionGoodsReceiptStatus failed:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Lỗi không xác định"
    };
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────────────────────────
// updateGoodsReceiptPayment
// ──────────────────────────────────────────────────────────────────────
//
// Thanh toán cho NCC — HOÀN TOÀN TÁCH BIỆT khỏi receipt_status/tồn kho (xem
// addStockForGoodsReceiptItems ở trên). payment_status derive giống
// orders.payment_status (lib/orders/repository.ts): so `paid` với `total_cost`.
export async function updateGoodsReceiptPayment(input: {
  goodsReceiptId: string;
  paid: number;
  paymentMethod: "cash" | "bank_transfer" | "card";
}): Promise<{ success: boolean; message: string; paymentStatus?: string }> {
  if (!isDatabaseConfigured) {
    return { success: false, message: "Database chưa cấu hình." };
  }
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();

  try {
    const grRes = await client.query(
      `select id, total_cost from goods_receipts where id = $1::uuid`,
      [input.goodsReceiptId]
    );
    if (grRes.rows.length === 0) {
      return { success: false, message: "Không tìm thấy đơn nhập hàng." };
    }
    const totalCost = Number(grRes.rows[0].total_cost ?? 0);
    const paid = Math.max(0, Number(input.paid) || 0);
    const paymentStatus = paid >= totalCost && totalCost > 0 ? "paid" : paid > 0 ? "partial" : "unpaid";

    await client.query(
      `update goods_receipts
          set paid = $2,
              payment_method = $3,
              payment_status = $4,
              updated_at = now()
        where id = $1`,
      [input.goodsReceiptId, paid, input.paymentMethod, paymentStatus]
    );

    const msg =
      paymentStatus === "paid"
        ? "Đã thanh toán đủ cho nhà cung cấp."
        : paymentStatus === "partial"
          ? "Đã ghi nhận thanh toán một phần."
          : "Đã cập nhật thanh toán.";
    return { success: true, message: msg, paymentStatus };
  } catch (err) {
    console.error("updateGoodsReceiptPayment failed:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Lỗi không xác định"
    };
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────────────────────────
// createGoodsReceiptFromPurchaseOrder
// ──────────────────────────────────────────────────────────────────────

export async function createGoodsReceiptFromPurchaseOrder(input: {
  purchaseOrderId: string;
  branch?: string;
  staff?: string;
  note?: string;
}): Promise<{
  success: boolean;
  message: string;
  goodsReceiptId: string | null;
  goodsReceiptCode: string | null;
}> {
  if (!isDatabaseConfigured) {
    return { success: false, message: "Database chưa cấu hình.", goodsReceiptId: null, goodsReceiptCode: null };
  }
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const poRes = await client.query(
      `select id, code, supplier_id, supplier_name, branch, staff, note
         from purchase_orders where id = $1::uuid`,
      [input.purchaseOrderId]
    );
    if (poRes.rows.length === 0) {
      await client.query("rollback");
      return { success: false, message: "Không tìm thấy đơn đặt hàng.", goodsReceiptId: null, goodsReceiptCode: null };
    }
    const po = poRes.rows[0];

    const existingGr = await client.query(
      `select id, code from goods_receipts where purchase_order_id = $1::uuid limit 1`,
      [po.id]
    );
    if (existingGr.rows.length > 0) {
      await client.query("rollback");
      return {
        success: false,
        message: "Đơn nhập hàng đã tồn tại cho đơn đặt hàng này.",
        goodsReceiptId: String(existingGr.rows[0].id),
        goodsReceiptCode: String(existingGr.rows[0].code)
      };
    }

    const poItemsRes = await client.query(
      `select * from purchase_order_items where purchase_order_id = $1::uuid order by position asc`,
      [po.id]
    );
    if (poItemsRes.rows.length === 0) {
      await client.query("rollback");
      return { success: false, message: "Đơn đặt hàng chưa có dòng hàng nào.", goodsReceiptId: null, goodsReceiptCode: null };
    }

    const grCodeRes = await client.query(
      `select code from goods_receipts where code ~ '^PNH[0-9]+$'
        order by length(code) desc, code desc limit 1`
    );
    let grCode = "PNH00001";
    if (grCodeRes.rows.length > 0) {
      const cur = String(grCodeRes.rows[0].code);
      const numPart = parseInt(cur.replace(/\D/g, ""), 10);
      if (Number.isFinite(numPart)) grCode = `PNH${String(numPart + 1).padStart(5, "0")}`;
    }

    const subtotal = poItemsRes.rows.reduce((s, it) => s + Number(it.line_total ?? 0), 0);
    const totalQty = poItemsRes.rows.reduce((s, it) => s + Number(it.ordered_qty ?? 0), 0);
    const branch = (input.branch ?? po.branch ?? "Chi nhánh chính").trim() || "Chi nhánh chính";
    const staff = (input.staff ?? po.staff ?? "").trim();

    const grInsert = await client.query(
      `insert into goods_receipts
        (code, supplier_id, supplier_name, supplier_phone, purchase_order_id,
         purchase_order_code, branch, staff, note, tags,
         receipt_status, order_status, subtotal, discount, tax,
         total_cost, total_quantity, paid, payment_method, received_at)
       values ($1,$2,$3,'',$4,$5,$6,$7,$8,'{}'::text[],
               'pending','pending',$9,0,0,$10,$11,0,'cash',now())
       returning id, code`,
      [
        grCode,
        po.supplier_id,
        po.supplier_name,
        po.id,
        po.code,
        branch,
        staff,
        input.note ?? `Tạo từ đơn đặt hàng ${po.code}.`,
        subtotal,
        subtotal,
        totalQty
      ]
    );
    const grId = String(grInsert.rows[0].id);

    let grPos = 1;
    for (const it of poItemsRes.rows) {
      const orderedQty = Number(it.ordered_qty ?? 0);
      const unitCost = Number(it.unit_cost ?? 0);
      await client.query(
        `insert into goods_receipt_items
           (goods_receipt_id, purchase_order_item_id, product_id, sku, product_name,
            unit, image_url, ordered_qty, received_qty, unit_cost, discount,
            line_total, position, note, stock_added_at, created_at)
         values ($1,$2,$3,$4,$5,$6,'',$7,$7,$8,0,$9,$10,'',NULL,now())`,
        [
          grId,
          it.id,
          it.product_id ?? null,
          it.sku ?? "",
          it.product_name ?? "",
          it.unit ?? "",
          orderedQty,
          unitCost,
          Number(it.line_total ?? orderedQty * unitCost),
          grPos++
        ]
      );
    }

    await client.query("commit");
    return {
      success: true,
      message: `Đã tạo đơn nhập hàng ${grCode}.`,
      goodsReceiptId: grId,
      goodsReceiptCode: grCode
    };
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    console.error("createGoodsReceiptFromPurchaseOrder failed:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Lỗi không xác định",
      goodsReceiptId: null,
      goodsReceiptCode: null
    };
  } finally {
    client.release();
  }
}
