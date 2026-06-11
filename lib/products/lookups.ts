import type pg from "pg";
import { getPool, isDatabaseConfigured } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { readJsonStore } from "../shared/json-store";

// Helper function to return a clean string or trimmed value
function cell(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

async function addQuickOptions(client: pg.PoolClient | pg.Pool, pairs: Array<[string, unknown]>) {
  const normalized = pairs
    .map(([field, value]) => [field, cell(value)] as const)
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

export async function addInvoiceQuickOptions(client: pg.PoolClient | pg.Pool, rows: any[]) {
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

  }

  await addQuickOptions(client, pairs);
}

export async function readLookups() {
  if (!isDatabaseConfigured) {
    const store = await readJsonStore();
    const unique = (values: unknown[]) => Array.from(new Set(values.map((value) => cell(value)).filter(Boolean))).sort();
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
  const options = await pool.query("select field, value from quick_options order by usage_count desc, value asc limit 500");
  
  // Query from product_catalog using aliases matching the React frontend expected property names
  const products = await pool.query(
    `
      select 
        sku, 
        input_name as input_product_name, 
        invoice_name as adjusted_invoice_name, 
        retail_name, 
        unit, 
        sale_price, 
        image_url 
      from product_catalog 
      order by updated_at desc 
      limit 500
    `
  );

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
      unit: String(row.unit ?? ""),
      salePrice: String(row.sale_price ?? ""),
      imageUrl: String(row.image_url ?? "")
    }))
  };
}
