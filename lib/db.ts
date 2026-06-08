import pg from "pg";

const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var invoiceflowPool: pg.Pool | undefined;
  // eslint-disable-next-line no-var
  var invoiceflowMigration: Promise<void> | undefined;
}

export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL");
  }

  if (!globalThis.invoiceflowPool) {
    globalThis.invoiceflowPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 6,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000
    });
  }

  return globalThis.invoiceflowPool;
}

export async function ensureDatabase() {
  if (!isDatabaseConfigured) return;
  if (!globalThis.invoiceflowMigration) {
    globalThis.invoiceflowMigration = migrate();
  }
  await globalThis.invoiceflowMigration;
}

async function migrate() {
  const pool = getPool();
  await pool.query(`
    create table if not exists invoice_documents (
      id text primary key,
      file_name text not null,
      file_size bigint not null default 0,
      mime_type text not null default 'application/octet-stream',
      stored_path text not null default '',
      uploaded_at timestamptz not null,
      status text not null check (status in ('scanned', 'error')),
      row_count integer not null default 0,
      warnings jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now()
    );

    create table if not exists invoice_rows (
      id text primary key,
      document_id text not null references invoice_documents(id) on delete cascade,
      source_file_name text not null default '',
      invoice_date text not null default '',
      supplier_name text not null default '',
      invoice_symbol text not null default '',
      invoice_number text not null default '',
      input_product_name text not null default '',
      internal_product_code text not null default '',
      adjusted_invoice_name text not null default '',
      retail_name text not null default '',
      unit text not null default '',
      quantity text not null default '',
      unit_price text not null default '',
      amount_before_tax text not null default '',
      vat_rate text not null default '',
      vat_amount text not null default '',
      total_after_tax text not null default '',
      unit_price_after_tax text not null default '',
      note text not null default '',
      created_at timestamptz not null,
      updated_at timestamptz not null
    );

    create table if not exists quick_options (
      field text not null,
      value text not null,
      usage_count integer not null default 1,
      last_used_at timestamptz not null default now(),
      primary key (field, value)
    );

    create table if not exists catalog_products (
      id bigserial primary key,
      sku text not null unique,
      input_product_name text not null default '',
      adjusted_invoice_name text not null default '',
      retail_name text not null default '',
      unit text not null default '',
      updated_at timestamptz not null default now()
    );

    create table if not exists activity_logs (
      id bigserial primary key,
      type text not null,
      message text not null,
      created_at timestamptz not null default now()
    );

    create index if not exists invoice_rows_document_id_idx on invoice_rows(document_id);
    create index if not exists invoice_rows_supplier_idx on invoice_rows(supplier_name);
    create index if not exists invoice_rows_sku_idx on invoice_rows(internal_product_code);
  `);
}

export async function logActivity(type: string, message: string) {
  if (!isDatabaseConfigured) return;
  await ensureDatabase();
  await getPool().query("insert into activity_logs (type, message) values ($1, $2)", [type, message]);
}
