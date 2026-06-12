import { getPool, isDatabaseConfigured } from "./connection";

declare global {
  // eslint-disable-next-line no-var
  var invoiceflowMigration: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var invoiceflowMigrationVersion: number | undefined;
}

const SCHEMA_VERSION = 4; // Bump version for scan apply state and product catalog compatibility
const MIGRATION_LOCK_KEY = 2026061104;

export async function ensureDatabase() {
  if (!isDatabaseConfigured) return;
  if (!globalThis.invoiceflowMigration || globalThis.invoiceflowMigrationVersion !== SCHEMA_VERSION) {
    globalThis.invoiceflowMigration = migrate()
      .then(() => {
        globalThis.invoiceflowMigrationVersion = SCHEMA_VERSION;
      })
      .catch((error) => {
        globalThis.invoiceflowMigration = undefined;
        globalThis.invoiceflowMigrationVersion = undefined;
        throw error;
      });
  }
  await globalThis.invoiceflowMigration;
}

async function migrate() {
  const client = await getPool().connect();

  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

    // 1. Core extensions
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // 2. Invoice Flow tables
    await client.query(`
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

    create table if not exists activity_logs (
      id bigserial primary key,
      type text not null,
      message text not null,
      created_at timestamptz not null default now()
    );

    alter table invoice_documents add column if not exists original_row_count integer not null default 0;
    alter table invoice_documents add column if not exists deleted_row_count integer not null default 0;
    alter table invoice_documents add column if not exists duplicate_count integer not null default 0;
    alter table invoice_documents add column if not exists last_duplicate_at timestamptz;
    alter table invoice_documents add column if not exists applied_to_summary boolean not null default false;
    alter table invoice_documents add column if not exists applied_at timestamptz;
    alter table invoice_rows add column if not exists product_synced_at timestamptz;
    alter table invoice_rows add column if not exists synced_product_id text not null default '';
    alter table invoice_rows add column if not exists inventory_added_quantity text not null default '';

    create index if not exists invoice_rows_document_id_idx on invoice_rows(document_id);
    create index if not exists invoice_rows_supplier_idx on invoice_rows(supplier_name);
    create index if not exists invoice_rows_sku_idx on invoice_rows(internal_product_code);
  `);

  // 3. SAPO Product Management tables (Standardized from product_sql.md)
    await client.query(`
    create table if not exists categories (
      id               uuid primary key default gen_random_uuid(),
      parent_id        uuid references categories(id) on delete set null,
      name             text not null,
      slug             text unique,
      position         int default 0,
      description      text,
      type             text default 'manual',
      image_url        text,
      seo_title        text,
      seo_description  text,
      sales_channels   text[] default '{}',
      theme_template   text default 'collection',
      created_at       timestamptz default now(),
      updated_at       timestamptz default now()
    );

    create table if not exists brands (
      id          uuid primary key default gen_random_uuid(),
      name        text not null unique,
      slug        text unique,
      logo_url    text,
      created_at  timestamptz default now()
    );

    create table if not exists product_types (
      id          uuid primary key default gen_random_uuid(),
      name        text not null unique,
      created_at  timestamptz default now()
    );

    create table if not exists locations (
      id          uuid primary key default gen_random_uuid(),
      name        text not null,
      address     text,
      phone       text,
      is_active   boolean default true,
      is_default  boolean default false,
      created_at  timestamptz default now(),
      updated_at  timestamptz default now()
    );

    create table if not exists products (
      id                    uuid primary key default gen_random_uuid(),
      name                  text not null,
      sku                   text unique,
      barcode               text,
      unit                  text,
      description           text,
      short_description     text,
      price                 numeric(18,2) not null default 0,
      compare_at_price      numeric(18,2),
      cost_price            numeric(18,2),
      taxable               boolean default false,
      track_inventory       boolean default true,
      allow_negative_stock  boolean default false,
      manage_expiry         boolean default false,
      requires_shipping     boolean default true,
      weight                numeric(10,3) default 0,
      weight_unit           text default 'g' check (weight_unit in ('g', 'kg', 'lb', 'oz')),
      category_id           uuid references categories(id) on delete set null,
      brand_id              uuid references brands(id) on delete set null,
      product_type_id       uuid references product_types(id) on delete set null,
      tax_group             text,
      tags                  text[] default '{}',
      sales_channels        text[] default '{}',
      theme_template        text default 'product',
      seo_title             text,
      seo_description       text,
      slug                  text unique,
      status                text default 'active' check (status in ('active', 'inactive', 'draft')),
      published_at          timestamptz,
      created_at            timestamptz default now(),
      updated_at            timestamptz default now()
    );

    create table if not exists product_options (
      id          uuid primary key default gen_random_uuid(),
      product_id  uuid not null references products(id) on delete cascade,
      name        text not null,
      position    int default 1,
      values      text[] default '{}'
    );

    create table if not exists product_variants (
      id                uuid primary key default gen_random_uuid(),
      product_id        uuid not null references products(id) on delete cascade,
      title             text,
      sku               text unique,
      barcode           text,
      option1           text,
      option2           text,
      option3           text,
      price             numeric(18,2),
      compare_at_price  numeric(18,2),
      cost_price        numeric(18,2),
      weight            numeric(10,3),
      weight_unit       text default 'g' check (weight_unit in ('g', 'kg', 'lb', 'oz')),
      image_id          uuid,
      position          int default 1,
      created_at        timestamptz default now(),
      updated_at        timestamptz default now()
    );

    create table if not exists inventory_levels (
      id                uuid primary key default gen_random_uuid(),
      variant_id        uuid not null references product_variants(id) on delete cascade,
      location_id       uuid not null references locations(id) on delete cascade,
      quantity          int default 0,
      quantity_on_hold  int default 0,
      storage_location  text,
      updated_at        timestamptz default now(),
      unique(variant_id, location_id)
    );

    create table if not exists product_batches (
      id              uuid primary key default gen_random_uuid(),
      variant_id      uuid not null references product_variants(id) on delete cascade,
      location_id     uuid not null references locations(id) on delete cascade,
      batch_number    text,
      manufacture_date date,
      expiry_date     date,
      quantity        int default 0,
      cost_price      numeric(18,2),
      note            text,
      created_at      timestamptz default now(),
      updated_at      timestamptz default now()
    );

    create table if not exists product_images (
      id          uuid primary key default gen_random_uuid(),
      product_id  uuid not null references products(id) on delete cascade,
      url         text not null,
      alt         text,
      position    int default 1,
      created_at  timestamptz default now()
    );

    create table if not exists product_catalog (
      id            bigint primary key generated always as identity,
      sku           text unique not null,
      input_name    text not null,
      invoice_name  text,
      retail_name   text,
      unit          text,
      sale_price    numeric(18,2),
      image_url     text,
      product_id    uuid references products(id) on delete set null,
      created_at    timestamptz default now(),
      updated_at    timestamptz default now()
    );

    create index if not exists idx_products_sku        on products(sku);
    create index if not exists idx_products_status     on products(status);
    create index if not exists idx_variants_sku     on product_variants(sku);
    create index if not exists idx_catalog_sku        on product_catalog(sku);
    create index if not exists idx_catalog_product    on product_catalog(product_id);

    alter table categories add column if not exists description text;
    alter table categories add column if not exists type text default 'manual';
    alter table categories add column if not exists image_url text;
    alter table categories add column if not exists seo_title text;
    alter table categories add column if not exists seo_description text;
    alter table categories add column if not exists sales_channels text[] default '{}';
    alter table categories add column if not exists theme_template text default 'collection';
    alter table product_catalog add column if not exists sale_price numeric(18,2);
    alter table product_catalog add column if not exists image_url text;
    alter table product_catalog add column if not exists product_id uuid references products(id) on delete set null;
  `);

  // Add foreign key constraint to variants if product_images table is ready, avoiding cycle constraints on creation
    await client.query(`
    alter table product_variants
      add constraint fk_variant_image
      foreign key (image_id) references product_images(id) on delete set null
      not valid;
    alter table product_variants
      validate constraint fk_variant_image;
    `).catch(() => undefined); // Catch if it already exists
  } finally {
    await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
