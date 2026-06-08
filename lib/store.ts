import { promises as fs } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { ensureDatabase, getPool, isDatabaseConfigured, logActivity } from "./db";
import { normalizeFinancials } from "./format";
import { removeStoredObject } from "./supabase-storage";
import {
  appStoreSchema,
  type AppStore,
  type InvoiceDocument,
  type InvoiceRow
} from "./schema";

const dataDir = path.join(process.cwd(), "data");
const storePath = path.join(dataDir, "invoiceflow-store.json");
export const uploadDir = path.join(dataDir, "uploads");

let writeQueue = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(uploadDir, { recursive: true });
}

function asIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function cell(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function invoiceDocumentFromDb(row: Record<string, unknown>): InvoiceDocument {
  return {
    id: String(row.id),
    fileName: String(row.file_name ?? ""),
    fileSize: Number(row.file_size ?? 0),
    mimeType: String(row.mime_type ?? "application/octet-stream"),
    storedPath: String(row.stored_path ?? ""),
    uploadedAt: asIso(row.uploaded_at),
    status: row.status === "error" ? "error" : "scanned",
    rowCount: Number(row.row_count ?? 0),
    warnings: asArray<string>(row.warnings)
  };
}

function invoiceRowFromDb(row: Record<string, unknown>): InvoiceRow {
  return {
    id: String(row.id),
    documentId: String(row.document_id),
    sourceFileName: String(row.source_file_name ?? ""),
    invoiceDate: String(row.invoice_date ?? ""),
    supplierName: String(row.supplier_name ?? ""),
    invoiceSymbol: String(row.invoice_symbol ?? ""),
    invoiceNumber: String(row.invoice_number ?? ""),
    inputProductName: String(row.input_product_name ?? ""),
    internalProductCode: String(row.internal_product_code ?? ""),
    adjustedInvoiceName: String(row.adjusted_invoice_name ?? ""),
    retailName: String(row.retail_name ?? ""),
    unit: String(row.unit ?? ""),
    quantity: String(row.quantity ?? ""),
    unitPrice: String(row.unit_price ?? ""),
    amountBeforeTax: String(row.amount_before_tax ?? ""),
    vatRate: String(row.vat_rate ?? ""),
    vatAmount: String(row.vat_amount ?? ""),
    totalAfterTax: String(row.total_after_tax ?? ""),
    unitPriceAfterTax: String(row.unit_price_after_tax ?? ""),
    note: String(row.note ?? ""),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

async function readJsonStore(): Promise<AppStore> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(storePath, "utf8");
    return appStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Could not read store, using empty store:", error);
    }
    return { documents: [], rows: [] };
  }
}

async function writeJsonStoreNow(store: AppStore) {
  await ensureDataDir();
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

export async function readStore(): Promise<AppStore> {
  await ensureDataDir();
  if (!isDatabaseConfigured) return readJsonStore();

  await ensureDatabase();
  const pool = getPool();
  const [documentRows, invoiceRows] = await Promise.all([
    pool.query("select * from invoice_documents order by uploaded_at desc"),
    pool.query("select * from invoice_rows order by created_at asc")
  ]);

  return {
    documents: documentRows.rows.map(invoiceDocumentFromDb),
    rows: invoiceRows.rows.map(invoiceRowFromDb)
  };
}

export function updateStore(updater: (store: AppStore) => AppStore | Promise<AppStore>) {
  if (isDatabaseConfigured) {
    writeQueue = writeQueue.then(async () => {
      const current = await readStore();
      const next = await updater(current);
      await writeJsonStoreNow(next);
      return undefined;
    });
    return writeQueue;
  }

  writeQueue = writeQueue.then(async () => {
    const current = await readJsonStore();
    const next = await updater(current);
    await writeJsonStoreNow(next);
    return undefined;
  });
  return writeQueue;
}

async function addQuickOptions(client: pg.PoolClient | pg.Pool, pairs: Array<[string, unknown]>) {
  const normalized = pairs
    .map(([field, value]) => [field, cell(value).trim()] as const)
    .filter(([, value]) => value.length > 0);

  for (const [field, value] of normalized) {
    await client.query(
      `
        insert into quick_options (field, value, usage_count, last_used_at)
        values ($1, $2, 1, now())
        on conflict (field, value)
        do update set usage_count = quick_options.usage_count + 1, last_used_at = now()
      `,
      [field, value]
    );
  }
}

async function addInvoiceQuickOptions(client: pg.PoolClient | pg.Pool, rows: InvoiceRow[]) {
  const pairs: Array<[string, unknown]> = [];
  for (const row of rows) {
    pairs.push(
      ["supplierName", row.supplierName],
      ["invoiceSymbol", row.invoiceSymbol],
      ["inputProductName", row.inputProductName],
      ["internalProductCode", row.internalProductCode],
      ["adjustedInvoiceName", row.adjustedInvoiceName],
      ["retailName", row.retailName],
      ["unit", row.unit],
      ["vatRate", row.vatRate]
    );

    if (cell(row.internalProductCode).trim()) {
      await client.query(
        `
          insert into catalog_products (sku, input_product_name, adjusted_invoice_name, retail_name, unit, updated_at)
          values ($1, $2, $3, $4, $5, now())
          on conflict (sku)
          do update set
            input_product_name = coalesce(nullif(excluded.input_product_name, ''), catalog_products.input_product_name),
            adjusted_invoice_name = coalesce(nullif(excluded.adjusted_invoice_name, ''), catalog_products.adjusted_invoice_name),
            retail_name = coalesce(nullif(excluded.retail_name, ''), catalog_products.retail_name),
            unit = coalesce(nullif(excluded.unit, ''), catalog_products.unit),
            updated_at = now()
        `,
        [
          cell(row.internalProductCode),
          cell(row.inputProductName),
          cell(row.adjustedInvoiceName),
          cell(row.retailName),
          cell(row.unit)
        ]
      );
    }
  }

  await addQuickOptions(client, pairs);
}

export async function readLookups() {
  if (!isDatabaseConfigured) {
    const store = await readJsonStore();
    const unique = (values: unknown[]) => Array.from(new Set(values.map((value) => cell(value).trim()).filter(Boolean))).sort();
    return {
      suppliers: unique(store.rows.map((row) => row.supplierName)),
      inputProductNames: unique(store.rows.map((row) => row.inputProductName)),
      internalProductCodes: unique(store.rows.map((row) => row.internalProductCode)),
      adjustedInvoiceNames: unique(store.rows.map((row) => row.adjustedInvoiceName)),
      retailNames: unique(store.rows.map((row) => row.retailName)),
      units: unique(store.rows.map((row) => row.unit)),
      vatRates: unique(store.rows.map((row) => row.vatRate)),
      products: []
    };
  }

  await ensureDatabase();
  const pool = getPool();
  const [options, products] = await Promise.all([
    pool.query("select field, value from quick_options order by usage_count desc, value asc limit 500"),
    pool.query("select sku, input_product_name, adjusted_invoice_name, retail_name, unit from catalog_products order by updated_at desc limit 500")
  ]);
  const byField = (field: string) => options.rows.filter((row) => row.field === field).map((row) => String(row.value));
  return {
    suppliers: byField("supplierName"),
    inputProductNames: byField("inputProductName"),
    internalProductCodes: byField("internalProductCode"),
    adjustedInvoiceNames: byField("adjustedInvoiceName"),
    retailNames: byField("retailName"),
    units: byField("unit"),
    vatRates: byField("vatRate"),
    products: products.rows.map((row) => ({
      sku: String(row.sku ?? ""),
      inputProductName: String(row.input_product_name ?? ""),
      adjustedInvoiceName: String(row.adjusted_invoice_name ?? ""),
      retailName: String(row.retail_name ?? ""),
      unit: String(row.unit ?? "")
    }))
  };
}

export async function upsertDocumentWithRows(document: InvoiceDocument, rows: InvoiceRow[]) {
  if (!isDatabaseConfigured) {
    await updateStore((store) => ({
      ...store,
      documents: [...store.documents.filter((item) => item.id !== document.id), document].sort((a, b) =>
        b.uploadedAt.localeCompare(a.uploadedAt)
      ),
      rows: [...store.rows.filter((row) => row.documentId !== document.id), ...rows].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
      )
    }));
    return readJsonStore();
  }

  await ensureDatabase();
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query(
      `
        insert into invoice_documents
          (id, file_name, file_size, mime_type, stored_path, uploaded_at, status, row_count, warnings, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
        on conflict (id)
        do update set
          file_name = excluded.file_name,
          file_size = excluded.file_size,
          mime_type = excluded.mime_type,
          stored_path = excluded.stored_path,
          uploaded_at = excluded.uploaded_at,
          status = excluded.status,
          row_count = excluded.row_count,
          warnings = excluded.warnings,
          updated_at = now()
      `,
      [
        document.id,
        document.fileName,
        document.fileSize,
        document.mimeType,
        document.storedPath,
        document.uploadedAt,
        document.status,
        rows.length,
        JSON.stringify(document.warnings)
      ]
    );
    await client.query("delete from invoice_rows where document_id = $1", [document.id]);

    for (const row of rows) {
      const normalized = normalizeFinancials(row);
      await client.query(
        `
          insert into invoice_rows
            (id, document_id, source_file_name, invoice_date, supplier_name, invoice_symbol, invoice_number,
             input_product_name, internal_product_code, adjusted_invoice_name, retail_name, unit, quantity,
             unit_price, amount_before_tax, vat_rate, vat_amount, total_after_tax, unit_price_after_tax,
             note, created_at, updated_at)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
             $18, $19, $20, $21, $22)
        `,
        [
          normalized.id,
          normalized.documentId,
          normalized.sourceFileName,
          cell(normalized.invoiceDate),
          cell(normalized.supplierName),
          cell(normalized.invoiceSymbol),
          cell(normalized.invoiceNumber),
          cell(normalized.inputProductName),
          cell(normalized.internalProductCode),
          cell(normalized.adjustedInvoiceName),
          cell(normalized.retailName),
          cell(normalized.unit),
          cell(normalized.quantity),
          cell(normalized.unitPrice),
          cell(normalized.amountBeforeTax),
          cell(normalized.vatRate),
          cell(normalized.vatAmount),
          cell(normalized.totalAfterTax),
          cell(normalized.unitPriceAfterTax),
          cell(normalized.note),
          normalized.createdAt,
          normalized.updatedAt
        ]
      );
    }

    await addInvoiceQuickOptions(client, rows);
    await client.query("commit");
    await logActivity(document.status === "scanned" ? "ocr" : "warning", `${document.fileName}: ${rows.length} dòng`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return readStore();
}

export async function deleteDocument(documentId: string) {
  const store = await readStore();
  const document = store.documents.find((item) => item.id === documentId);

  if (!isDatabaseConfigured) {
    await updateStore((current) => ({
      ...current,
      documents: current.documents.filter((item) => item.id !== documentId),
      rows: current.rows.filter((row) => row.documentId !== documentId)
    }));
    if (document?.storedPath) await removeStoredObject(document.storedPath);
    return readJsonStore();
  }

  await ensureDatabase();
  await getPool().query("delete from invoice_documents where id = $1", [documentId]);
  if (document?.storedPath) await removeStoredObject(document.storedPath);
  await logActivity("delete", `Xóa tài liệu hóa đơn ${document?.fileName ?? documentId}`);
  return readStore();
}

export async function deleteRow(rowId: string) {
  if (!isDatabaseConfigured) {
    await updateStore((store) => {
      const removed = store.rows.find((row) => row.id === rowId);
      const rows = store.rows.filter((row) => row.id !== rowId);
      const documents = store.documents.map((document) =>
        removed && document.id === removed.documentId
          ? { ...document, rowCount: Math.max(0, document.rowCount - 1) }
          : document
      );
      return { ...store, documents, rows };
    });
    return readJsonStore();
  }

  await ensureDatabase();
  const pool = getPool();
  const current = await pool.query("select document_id from invoice_rows where id = $1", [rowId]);
  const documentId = current.rows[0]?.document_id;
  await pool.query("delete from invoice_rows where id = $1", [rowId]);
  if (documentId) {
    await pool.query(
      "update invoice_documents set row_count = greatest(row_count - 1, 0), updated_at = now() where id = $1",
      [documentId]
    );
  }
  await logActivity("delete", `Xóa dòng hóa đơn ${rowId}`);
  return readStore();
}

export async function patchRow(rowId: string, patch: Partial<InvoiceRow>) {
  const now = new Date().toISOString();

  if (!isDatabaseConfigured) {
    await updateStore((store) => ({
      ...store,
      rows: store.rows.map((row) =>
        row.id === rowId ? normalizeFinancials({ ...row, ...patch, updatedAt: now }) : row
      )
    }));
    return readJsonStore();
  }

  await ensureDatabase();
  const pool = getPool();
  const existing = await pool.query("select * from invoice_rows where id = $1", [rowId]);
  if (!existing.rows[0]) return readStore();

  const merged = normalizeFinancials({ ...invoiceRowFromDb(existing.rows[0]), ...patch, updatedAt: now });
  await pool.query(
    `
      update invoice_rows set
        invoice_date = $2,
        supplier_name = $3,
        invoice_symbol = $4,
        invoice_number = $5,
        input_product_name = $6,
        internal_product_code = $7,
        adjusted_invoice_name = $8,
        retail_name = $9,
        unit = $10,
        quantity = $11,
        unit_price = $12,
        amount_before_tax = $13,
        vat_rate = $14,
        vat_amount = $15,
        total_after_tax = $16,
        unit_price_after_tax = $17,
        note = $18,
        updated_at = $19
      where id = $1
    `,
    [
      rowId,
      cell(merged.invoiceDate),
      cell(merged.supplierName),
      cell(merged.invoiceSymbol),
      cell(merged.invoiceNumber),
      cell(merged.inputProductName),
      cell(merged.internalProductCode),
      cell(merged.adjustedInvoiceName),
      cell(merged.retailName),
      cell(merged.unit),
      cell(merged.quantity),
      cell(merged.unitPrice),
      cell(merged.amountBeforeTax),
      cell(merged.vatRate),
      cell(merged.vatAmount),
      cell(merged.totalAfterTax),
      cell(merged.unitPriceAfterTax),
      cell(merged.note),
      now
    ]
  );
  await addInvoiceQuickOptions(pool, [merged]);
  await logActivity("edit", `Cập nhật dòng hóa đơn ${rowId}`);
  return readStore();
}
