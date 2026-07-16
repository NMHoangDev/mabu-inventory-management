import { getPool, isDatabaseConfigured } from "./connection";

declare global {
  // eslint-disable-next-line no-var
  var invoiceflowMigration: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var invoiceflowMigrationVersion: number | undefined;
}

const SCHEMA_VERSION = 25; // Bumped: stock_movements (lịch sử kho) + orders.discount_type (chiết khấu đơn theo % hoặc số tiền)
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

    -- Stock + reorder columns (idempotent)
    alter table products add column if not exists stock numeric(14,2) not null default 0;
    alter table products add column if not exists reorder_point numeric(14,2) not null default 0;
    alter table products add column if not exists reorder_quantity numeric(14,2) not null default 0;
    alter table products add column if not exists avg_daily_sales numeric(14,4) not null default 0;
    alter table products add column if not exists last_restocked_at timestamptz;
    alter table products add column if not exists preferred_supplier text;
    alter table products add column if not exists stock_updated_at timestamptz;

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

  // 4. Customer Management tables
  await client.query(`
    create table if not exists customer_groups (
      id          uuid primary key default gen_random_uuid(),
      name        text not null unique,
      description text,
      created_at  timestamptz default now(),
      updated_at  timestamptz default now()
    );

    create table if not exists customers (
      id                uuid primary key default gen_random_uuid(),
      code              text unique,
      name              text not null,
      phone             text,
      email             text,
      gender            text check (gender in ('male', 'female', 'other')),
      birthday          date,
      company           text,
      tax_code          text,
      website           text,
      description       text,
      tags              text[] default '{}',
      group_id          uuid references customer_groups(id) on delete set null,
      assigner_id       text,
      total_spent       numeric(18,2) default 0,
      total_orders      integer default 0,
      total_debt        numeric(18,2) default 0,
      birth_day         int,
      birth_month       int,
      last_order_at     timestamptz,
      created_at        timestamptz default now(),
      updated_at        timestamptz default now()
    );

    create table if not exists customer_addresses (
      id           uuid primary key default gen_random_uuid(),
      customer_id  uuid not null references customers(id) on delete cascade,
      is_default   boolean default false,
      recipient_name text,
      phone         text,
      address       text not null default '',
      ward          text,
      district      text,
      city          text,
      region        text,
      postal_code   text,
      address_type  text check (address_type in ('shipping', 'billing', 'other')),
      created_at   timestamptz default now(),
      updated_at   timestamptz default now()
    );

    create index if not exists idx_customers_code      on customers(code);
    create index if not exists idx_customers_phone     on customers(phone);
    create index if not exists idx_customers_email     on customers(email);
    create index if not exists idx_customers_group_id  on customers(group_id);
    create index if not exists idx_customer_addresses_customer on customer_addresses(customer_id);

    -- Add code + type columns to customer_groups if they don't exist (idempotent)
    alter table customer_groups add column if not exists code text;
    alter table customer_groups add column if not exists type text default 'Cố định';

    -- Seed 1 nhóm mặc định — form "Thêm khách hàng" bắt buộc chọn nhóm
    -- (xem app/(dashboard)/customers/CustomerFormModal.tsx), cần có sẵn ít
    -- nhất 1 lựa chọn để không khoá cứng luồng tạo khách hàng mới.
    insert into customer_groups (name, description)
      values ('Khách hàng thường', 'Nhóm mặc định')
      on conflict (name) do nothing;

    -- Backfill code cho các dòng (kể cả dòng vừa seed) - idempotent, chỉ update NULL.
    update customer_groups set code = upper(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) where code is null;
  `);

  // 5. Order Management tables
  await client.query(`
    create table if not exists orders (
      id              uuid primary key default gen_random_uuid(),
      code            text unique not null,
      customer_id     uuid references customers(id) on delete set null,
      customer_name   text not null default '',
      customer_phone  text default '',
      status          text not null default 'new'
                      check (status in ('new', 'processing', 'completed', 'cancelled')),
      payment_status  text not null default 'unpaid'
                      check (payment_status in ('unpaid', 'partial', 'paid', 'refunded')),
      fulfillment_status text not null default 'unshipped'
                      check (fulfillment_status in ('unshipped', 'shipping', 'shipped', 'returned')),
      source          text default 'store' check (source in ('store', 'facebook', 'website', 'zalo', 'other')),
      branch          text default 'Chi nhánh chính',
      staff           text default '',
      note            text default '',
      subtotal        numeric(18,2) not null default 0,
      discount        numeric(18,2) not null default 0,
      shipping_fee    numeric(18,2) not null default 0,
      total           numeric(18,2) not null default 0,
      paid            numeric(18,2) not null default 0,
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now()
    );

    create table if not exists order_items (
      id            uuid primary key default gen_random_uuid(),
      order_id      uuid not null references orders(id) on delete cascade,
      product_id    uuid references products(id) on delete set null,
      product_name  text not null default '',
      product_sku   text default '',
      unit          text default '',
      image_url     text default '',
      quantity      integer not null default 1,
      unit_price    numeric(18,2) not null default 0,
      line_total    numeric(18,2) not null default 0,
      position      integer default 1,
      created_at    timestamptz not null default now()
    );

    create index if not exists idx_orders_code         on orders(code);
    create index if not exists idx_orders_customer_id  on orders(customer_id);
    create index if not exists idx_orders_status       on orders(status);
    create index if not exists idx_orders_created_at   on orders(created_at desc);
    create index if not exists idx_order_items_order   on order_items(order_id);
  `);
  await client.query(`
    alter table customer_addresses
      add constraint fk_customer_addresses_customer
      foreign key (customer_id) references customers(id) on delete cascade
      not valid;
    alter table customer_addresses
      validate constraint fk_customer_addresses_customer;
  `).catch(() => undefined);

  // Add foreign key constraint to variants if product_images table is ready, avoiding cycle constraints on creation
    await client.query(`
    alter table product_variants
      add constraint fk_variant_image
      foreign key (image_id) references product_images(id) on delete set null
      not valid;
    alter table product_variants
      validate constraint fk_variant_image;
  `).catch(() => undefined); // Catch if it already exists

  // 6. Shipping tables
  await client.query(`
    create table if not exists shippings (
      id                 uuid primary key default gen_random_uuid(),
      tracking_code      text unique not null,
      order_id           uuid references orders(id) on delete set null,
      customer_name      text not null default '',
      customer_phone     text default '',
      shipping_address   text default '',
      province           text default '',
      district           text default '',
      ward               text default '',
      partner            text default 'NINJA VAN',
      partner_service    text default '',
      status             text not null default 'pending'
                        check (status in ('pending', 'packing', 'awaiting_pickup', 'shipping', 'delivered', 'returning', 'cancelled', 'returned', 'failed')),
      cod_amount         numeric(18,2) default 0,
      shipping_fee       numeric(18,2) default 0,
      weight             numeric(10,3) default 0,
      note               text default '',
      branch             text default 'Chi nhánh chính',
      staff              text default '',
      packed_at          timestamptz,
      picked_up_at       timestamptz,
      delivered_at       timestamptz,
      cancelled_at       timestamptz,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now()
    );

    create table if not exists shipping_events (
      id           bigserial primary key,
      shipping_id  uuid not null references shippings(id) on delete cascade,
      status       text not null,
      description  text default '',
      location     text default '',
      occurred_at  timestamptz not null default now(),
      created_at   timestamptz not null default now()
    );

    create index if not exists idx_shippings_tracking        on shippings(tracking_code);
    create index if not exists idx_shippings_status          on shippings(status);
    create index if not exists idx_shippings_partner         on shippings(partner);
    create index if not exists idx_shippings_order_id        on shippings(order_id);
    create index if not exists idx_shippings_created_at      on shippings(created_at desc);
    create index if not exists idx_shippings_packed_at       on shippings(packed_at desc);
    create index if not exists idx_shipping_events_shipping  on shipping_events(shipping_id, occurred_at asc);
  `);

  // 7. Shipping settings (singleton row for store-wide shipping config)
  await client.query(`
    create table if not exists shipping_settings (
      id                          integer primary key default 1,
      weight_source               text not null default 'order'
                                  check (weight_source in ('order', 'custom')),
      default_weight_g            integer not null default 0,
      default_dimension           text not null default 'default',
      default_requirement         text not null default 'view_only',
      default_note                text default '',
      auto_sync_returned_status   boolean not null default false,
      auto_sync_cod               boolean not null default true,
      pickup_warning_days         integer not null default 2,
      delivery_warning_days       integer not null default 3,
      restricted_zones            text default '',
      pickup_addresses            jsonb not null default '[]'::jsonb,
      updated_at                  timestamptz not null default now(),
      constraint shipping_settings_singleton check (id = 1)
    );

    insert into shipping_settings (id) values (1) on conflict (id) do nothing;
  `);

  // 8. Stock receipts + reorder suggestions (inventory automation)
  await client.query(`
    create table if not exists stock_receipts (
      id               uuid primary key default gen_random_uuid(),
      code             text unique not null,
      source           text not null default 'manual'
                       check (source in ('scan', 'manual', 'transfer', 'return')),
      invoice_row_id   text references invoice_rows(id) on delete set null,
      document_id      text references invoice_documents(id) on delete set null,
      supplier_name    text default '',
      note             text default '',
      total_quantity   numeric(14,2) not null default 0,
      total_amount     numeric(18,2) not null default 0,
      received_at      timestamptz not null default now(),
      staff            text default '',
      branch           text default 'Chi nhánh chính',
      created_at       timestamptz not null default now()
    );

    create table if not exists stock_receipt_items (
      id           uuid primary key default gen_random_uuid(),
      receipt_id   uuid not null references stock_receipts(id) on delete cascade,
      product_id   uuid references products(id) on delete set null,
      sku          text default '',
      product_name text not null default '',
      unit         text default '',
      quantity     numeric(14,2) not null default 0,
      unit_cost    numeric(18,2) not null default 0,
      line_total   numeric(18,2) not null default 0,
      position     int default 1,
      created_at   timestamptz not null default now()
    );

    create table if not exists reorder_suggestions (
      id              uuid primary key default gen_random_uuid(),
      product_id      uuid not null references products(id) on delete cascade,
      urgency         text not null default 'low'
                      check (urgency in ('low', 'medium', 'high', 'critical')),
      current_stock   numeric(14,2) not null,
      reorder_point   numeric(14,2) not null,
      suggested_qty   numeric(14,2) not null,
      avg_daily_sales numeric(14,4) default 0,
      days_until_zero int default 0,
      preferred_supplier text default '',
      note            text default '',
      status          text not null default 'open'
                      check (status in ('open', 'dismissed', 'ordered', 'received')),
      generated_at    timestamptz not null default now(),
      resolved_at     timestamptz
    );

    -- Idempotent unique constraint (one open suggestion per product)
    do $$
    begin
      if not exists (
        select 1 from pg_constraint
         where conname = 'reorder_suggestions_product_id_status_unique'
      ) then
        alter table reorder_suggestions
          add constraint reorder_suggestions_product_id_status_unique
          unique (product_id, status);
      end if;
    end$$;

    create index if not exists idx_stock_receipts_received    on stock_receipts(received_at desc);
    create index if not exists idx_stock_receipts_source      on stock_receipts(source);
    create index if not exists idx_stock_receipt_items_receipt on stock_receipt_items(receipt_id);
    create index if not exists idx_reorder_suggestions_status  on reorder_suggestions(status, urgency);
    create index if not exists idx_reorder_suggestions_product on reorder_suggestions(product_id);

    -- Link stock_receipts -> purchase_orders (PO completed sinh ra từ scan)
    alter table stock_receipts add column if not exists purchase_order_id uuid references purchase_orders(id) on delete set null;
    create index if not exists idx_stock_receipts_purchase_order on stock_receipts(purchase_order_id);

    -- Trace PO về invoice_documents gốc (để click "Xem hóa đơn" từ PO detail mở lại scan)
    alter table purchase_orders add column if not exists invoice_document_id text references invoice_documents(id) on delete set null;
    create index if not exists idx_purchase_orders_invoice_doc on purchase_orders(invoice_document_id);

    -- Idempotency: đánh dấu đã cộng tồn kho
    alter table goods_receipt_items add column if not exists stock_added_at timestamptz;
    create index if not exists idx_goods_receipt_items_stock_pending
      on goods_receipt_items(stock_added_at) where stock_added_at is null;

    -- Idempotency: đánh dấu đã trừ tồn kho khi đơn hàng chuyển "completed"
    -- (xem transitionOrderStatus trong lib/orders/repository.ts)
    alter table order_items add column if not exists stock_deducted_at timestamptz;
    create index if not exists idx_order_items_stock_pending
      on order_items(stock_deducted_at) where stock_deducted_at is null;

    -- Cho phép mỗi invoice_row tham chiếu nhiều PO/GR (audit)
    -- purchase_orders.id và goods_receipts.id đều là uuid nên FK phải cùng kiểu
    alter table invoice_rows add column if not exists purchase_order_id uuid references purchase_orders(id) on delete set null;
    alter table invoice_rows add column if not exists goods_receipt_id uuid references goods_receipts(id) on delete set null;
    create index if not exists idx_invoice_rows_po on invoice_rows(purchase_order_id);
    create index if not exists idx_invoice_rows_gr on invoice_rows(goods_receipt_id);
  `);

  // 9. Automation rules + log
  await client.query(`
    create table if not exists automation_rules (
      id           uuid primary key default gen_random_uuid(),
      name         text not null,
      description  text default '',
      enabled      boolean not null default true,
      trigger      text not null check (trigger in (
        'order.created','order.paid','order.shipped','shipping.pickup_overdue',
        'shipping.delivered','shipping.returned','stock.low','stock.out',
        'reorder.suggested','reorder.critical','invoice.scanned'
      )),
      conditions   jsonb not null default '[]'::jsonb,
      actions      jsonb not null default '[]'::jsonb,
      run_count    integer not null default 0,
      last_run_at  timestamptz,
      last_status  text default '',
      created_at   timestamptz not null default now(),
      updated_at   timestamptz not null default now()
    );

    create table if not exists automation_runs (
      id          bigserial primary key,
      rule_id     uuid references automation_rules(id) on delete cascade,
      rule_name   text not null default '',
      status      text not null check (status in ('success','failed','skipped')),
      message     text default '',
      payload     jsonb default '{}'::jsonb,
      executed_at timestamptz not null default now()
    );

    create index if not exists idx_automation_rules_enabled   on automation_rules(enabled);
    create index if not exists idx_automation_runs_rule       on automation_runs(rule_id, executed_at desc);
  `);

  // 10. Suppliers + Purchase Orders (Đơn đặt hàng nhập)
  await client.query(`
    create table if not exists suppliers (
      id              uuid primary key default gen_random_uuid(),
      code            text unique,
      name            text not null,
      contact_name    text default '',
      phone           text default '',
      email           text default '',
      tax_code        text default '',
      address         text default '',
      ward            text default '',
      district        text default '',
      city            text default '',
      note            text default '',
      tags            text[] default '{}',
      total_purchased numeric(18,2) default 0,
      total_orders    integer default 0,
      last_order_at   timestamptz,
      status          text not null default 'active'
                     check (status in ('active', 'inactive')),
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now()
    );

    alter table suppliers add column if not exists status text not null default 'active';
    do $$
    begin
      if not exists (
        select 1 from pg_constraint where conname = 'suppliers_status_check'
      ) then
        alter table suppliers add constraint suppliers_status_check
          check (status in ('active', 'inactive'));
      end if;
    end
    $$;

    create table if not exists purchase_orders (
      id              uuid primary key default gen_random_uuid(),
      code            text unique not null,
      supplier_id     uuid references suppliers(id) on delete set null,
      supplier_name   text not null default '',
      supplier_phone  text default '',
      branch          text default 'Chi nhánh mặc định',
      staff           text default '',
      expected_date   date,
      note            text default '',
      tags            text[] default '{}',
      status          text not null default 'draft'
                      check (status in ('draft', 'pending', 'partial', 'completed', 'cancelled')),
      subtotal        numeric(18,2) not null default 0,
      discount        numeric(18,2) not null default 0,
      tax             numeric(18,2) not null default 0,
      total           numeric(18,2) not null default 0,
      received_qty    numeric(18,2) not null default 0,
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now(),
      completed_at    timestamptz
    );

    create table if not exists purchase_order_items (
      id              uuid primary key default gen_random_uuid(),
      purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
      product_id      uuid references products(id) on delete set null,
      sku             text default '',
      product_name    text not null default '',
      unit            text default '',
      image_url       text default '',
      ordered_qty     numeric(14,2) not null default 0,
      received_qty    numeric(14,2) not null default 0,
      unit_cost       numeric(18,2) not null default 0,
      discount        numeric(18,2) not null default 0,
      line_total      numeric(18,2) not null default 0,
      position        integer default 1,
      note            text default '',
      created_at      timestamptz not null default now()
    );

    create index if not exists idx_suppliers_name        on suppliers(name);
    create index if not exists idx_suppliers_phone       on suppliers(phone);
    create index if not exists idx_suppliers_code        on suppliers(code);
    create index if not exists idx_purchase_orders_code          on purchase_orders(code);
    create index if not exists idx_purchase_orders_supplier      on purchase_orders(supplier_id);
    create index if not exists idx_purchase_orders_status        on purchase_orders(status);
    create index if not exists idx_purchase_orders_created_at    on purchase_orders(created_at desc);
    create index if not exists idx_purchase_order_items_order    on purchase_order_items(purchase_order_id);
    create index if not exists idx_purchase_order_items_product  on purchase_order_items(product_id);
    create index if not exists idx_purchase_order_items_sku      on purchase_order_items(sku);
  `);

  // 11. Stock checks (Phiếu kiểm hàng)
  await client.query(`
    create table if not exists stock_checks (
      id              uuid primary key default gen_random_uuid(),
      code            text unique not null,
      branch          text not null default 'Chi nhánh mặc định',
      staff           text not null default '',
      note            text default '',
      tags            text[] default '{}',
      status          text not null default 'draft'
                      check (status in ('draft', 'in_progress', 'balanced', 'cancelled')),
      total_items     integer not null default 0,
      matched_items   integer not null default 0,
      variance_items  integer not null default 0,
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now(),
      completed_at    timestamptz
    );

    create table if not exists stock_check_items (
      id                uuid primary key default gen_random_uuid(),
      stock_check_id    uuid not null references stock_checks(id) on delete cascade,
      product_id        uuid references products(id) on delete set null,
      sku               text default '',
      product_name      text not null default '',
      unit              text default '',
      image_url         text default '',
      system_quantity   numeric(14,2) not null default 0,
      actual_quantity   numeric(14,2) not null default 0,
      variance          numeric(14,2) not null default 0,
      variance_reason   text default '',
      note              text default '',
      position          integer default 1,
      created_at        timestamptz not null default now()
    );

    create index if not exists idx_stock_checks_code         on stock_checks(code);
    create index if not exists idx_stock_checks_status       on stock_checks(status);
    create index if not exists idx_stock_checks_created_at   on stock_checks(created_at desc);
    create index if not exists idx_stock_check_items_check   on stock_check_items(stock_check_id);
    create index if not exists idx_stock_check_items_product on stock_check_items(product_id);
    create index if not exists idx_stock_check_items_sku     on stock_check_items(sku);
  `);

  // 12. Goods Receipts (Đơn nhập hàng)
  await client.query(`
    create table if not exists goods_receipts (
      id                 uuid primary key default gen_random_uuid(),
      code               text unique not null,
      supplier_id        uuid references suppliers(id) on delete set null,
      supplier_name      text not null default '',
      supplier_phone     text default '',
      purchase_order_id  uuid references purchase_orders(id) on delete set null,
      purchase_order_code text default '',
      branch             text not null default 'Chi nhánh mặc định',
      staff              text default '',
      received_at        timestamptz not null default now(),
      expected_date      date,
      note               text default '',
      tags               text[] default '{}',
      receipt_status     text not null default 'pending'
                         check (receipt_status in ('pending','in_progress','completed','cancelled')),
      order_status       text not null default 'pending'
                         check (order_status in ('pending','in_progress','completed','cancelled')),
      subtotal          numeric(18,2) not null default 0,
      discount          numeric(18,2) not null default 0,
      tax               numeric(18,2) not null default 0,
      total_cost        numeric(18,2) not null default 0,
      total_quantity    numeric(14,2) not null default 0,
      paid              numeric(18,2) not null default 0,
      payment_method    text default 'cash',
      created_at        timestamptz not null default now(),
      updated_at        timestamptz not null default now(),
      completed_at      timestamptz
    );

    create table if not exists goods_receipt_items (
      id                    uuid primary key default gen_random_uuid(),
      goods_receipt_id      uuid not null references goods_receipts(id) on delete cascade,
      purchase_order_item_id uuid references purchase_order_items(id) on delete set null,
      product_id            uuid references products(id) on delete set null,
      sku                   text default '',
      product_name          text not null default '',
      unit                  text default '',
      image_url             text default '',
      ordered_qty           numeric(14,2) not null default 0,
      received_qty          numeric(14,2) not null default 0,
      unit_cost             numeric(18,2) not null default 0,
      discount              numeric(18,2) not null default 0,
      line_total            numeric(18,2) not null default 0,
      position              integer default 1,
      note                  text default '',
      created_at            timestamptz not null default now()
    );

    create index if not exists idx_goods_receipts_code         on goods_receipts(code);
    create index if not exists idx_goods_receipts_supplier     on goods_receipts(supplier_id);
    create index if not exists idx_goods_receipts_po           on goods_receipts(purchase_order_id);
    create index if not exists idx_goods_receipts_receipt_status on goods_receipts(receipt_status);
    create index if not exists idx_goods_receipts_order_status  on goods_receipts(order_status);
    create index if not exists idx_goods_receipts_created_at    on goods_receipts(created_at desc);
    create index if not exists idx_goods_receipt_items_receipt  on goods_receipt_items(goods_receipt_id);
    create index if not exists idx_goods_receipt_items_po_item  on goods_receipt_items(purchase_order_item_id);
    create index if not exists idx_goods_receipt_items_product on goods_receipt_items(product_id);
  `);

  // 14. Cost Adjustments (Điều chỉnh giá vốn)
  await client.query(`
    create table if not exists cost_adjustments (
      id           uuid primary key default gen_random_uuid(),
      code         text unique not null,
      branch       text not null default 'Chi nhánh mặc định',
      staff        text default '',
      note         text default '',
      tags         text[] default '{}',
      status       text not null default 'draft'
                   check (status in ('draft', 'completed', 'cancelled')),
      total_items  integer not null default 0,
      created_at   timestamptz not null default now(),
      updated_at   timestamptz not null default now(),
      completed_at timestamptz
    );

    create table if not exists cost_adjustment_items (
      id              uuid primary key default gen_random_uuid(),
      cost_adjustment_id uuid not null references cost_adjustments(id) on delete cascade,
      product_id      uuid references products(id) on delete set null,
      sku             text default '',
      product_name    text not null default '',
      unit            text default '',
      image_url       text default '',
      current_cost    numeric(18,2) not null default 0,
      new_cost        numeric(18,2) not null default 0,
      variance        numeric(18,2) not null default 0,
      position        integer default 1,
      note            text default '',
      created_at      timestamptz not null default now()
    );

    create index if not exists idx_cost_adjustments_code        on cost_adjustments(code);
    create index if not exists idx_cost_adjustments_status     on cost_adjustments(status);
    create index if not exists idx_cost_adjustments_created_at on cost_adjustments(created_at desc);
    create index if not exists idx_cost_adjustment_items_adj    on cost_adjustment_items(cost_adjustment_id);
    create index if not exists idx_cost_adjustment_items_prod  on cost_adjustment_items(product_id);
  `);

  // 15. Cash Book + Receipt Vouchers (Sổ quỹ / Phiếu thu)
  await client.query(`
    create table if not exists cash_book (
      id              uuid primary key default gen_random_uuid(),
      code            text unique not null,
      voucher_type    text not null default 'receipt'
                     check (voucher_type in ('receipt', 'payment')),
      payment_type    text default ''
                     check (payment_type in ('', 'order_payment', 'supplier_payment', 'other')),
      payment_category text default 'Tự động',
      group_name      text default '',
      person_name     text default '',
      reference_code   text default '',
      reference_type  text default '',
      payment_method  text default 'Tiền mặt',
      amount          numeric(18,2) not null default 0,
      branch          text default 'Chi nhánh mặc định',
      recorded_date   date default current_date,
      note            text default '',
      tags            text[] default '{}',
      debt_change     boolean default true,
      business_acc    boolean default true,
      status          text not null default 'completed'
                     check (status in ('draft', 'completed', 'cancelled')),
      created_by      text default '',
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now()
    );

    alter table cash_book add column if not exists payment_type text default '';
    alter table cash_book add column if not exists payment_category text default 'Tự động';
    alter table cash_book add column if not exists payment_method text default 'Tiền mặt';
    alter table cash_book add column if not exists branch text default 'Chi nhánh mặc định';
    alter table cash_book add column if not exists recorded_date date default current_date;
    alter table cash_book add column if not exists tags text[] default '{}';
    alter table cash_book add column if not exists debt_change boolean default true;
    alter table cash_book add column if not exists business_acc boolean default true;

    create index if not exists idx_cash_book_voucher_type   on cash_book(voucher_type);
    create index if not exists idx_cash_book_status        on cash_book(status);
    create index if not exists idx_cash_book_reference      on cash_book(reference_code);
    create index if not exists idx_cash_book_created_at     on cash_book(created_at desc);
    create index if not exists idx_cash_book_group         on cash_book(group_name);
    create index if not exists idx_cash_book_payment_type   on cash_book(payment_type);
  `);

  // 16. Tìm kiếm không dấu (unaccent + pg_trgm) + trạng thái thanh toán đơn
  // nhập hàng + ghi nhớ tần suất chọn sản phẩm khi tạo đơn hàng.
  //
  // search_text (products/customers): trước đây chỉ được set up bằng 1 file
  // SQL rời (supabase/migrations/2026-07-05_unaccent_search.sql) chạy tay qua
  // SQL editor — KHÔNG nằm trong migration tự động này, nên môi trường nào
  // chưa chạy tay sẽ thiếu extension/trigger dù cột search_text có thể đã tồn
  // tại (ALTER từng chạy 1 lần) → search "gõ không dấu" âm thầm không hoạt
  // động cho các row insert/update sau đó (không có trigger fill lại). Port
  // nguyên logic vào đây để mọi môi trường (kể cả DB mới) đều có đầy đủ và tự
  // backfill lại các row đang bị null.
  await client.query(`
    create extension if not exists unaccent;
    create extension if not exists pg_trgm;

    alter table customers add column if not exists search_text text;
    alter table products  add column if not exists search_text text;

    create or replace function customers_fill_search_text()
    returns trigger as $$
    begin
      new.search_text := lower(unaccent(
        coalesce(new.name,'') || ' ' ||
        coalesce(new.phone,'') || ' ' ||
        coalesce(new.code,'') || ' ' ||
        coalesce(new.email,'')
      ));
      return new;
    end;
    $$ language plpgsql;

    drop trigger if exists trg_customers_fill_search_text on customers;
    create trigger trg_customers_fill_search_text
      before insert or update of name, phone, code, email on customers
      for each row execute function customers_fill_search_text();

    create or replace function products_fill_search_text()
    returns trigger as $$
    begin
      new.search_text := lower(unaccent(
        coalesce(new.name,'') || ' ' ||
        coalesce(new.sku,'') || ' ' ||
        coalesce(new.barcode,'')
      ));
      return new;
    end;
    $$ language plpgsql;

    drop trigger if exists trg_products_fill_search_text on products;
    create trigger trg_products_fill_search_text
      before insert or update of name, sku, barcode on products
      for each row execute function products_fill_search_text();

    -- Backfill các row hiện có (kể cả row cũ trước khi có trigger).
    update customers set search_text = lower(unaccent(
      coalesce(name,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(code,'') || ' ' || coalesce(email,'')
    )) where search_text is null or search_text = '';

    update products set search_text = lower(unaccent(
      coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(barcode,'')
    )) where search_text is null or search_text = '';

    create index if not exists idx_customers_search_text_trgm on customers using gin (search_text gin_trgm_ops);
    create index if not exists idx_products_search_text_trgm  on products  using gin (search_text gin_trgm_ops);

    -- Trạng thái thanh toán đơn nhập hàng — TÁCH RIÊNG khỏi receipt_status
    -- (trạng thái nhập hàng/tồn kho). Trước đây chỉ có 1 nút "Thanh toán hoàn
    -- thành" nhưng thực chất nó điều khiển tồn kho (receipt_status), không hề
    -- liên quan thanh toán — dẫn tới đơn tạo bằng "Tạo & nhập hàng" hiển thị
    -- "Hoàn thành" ngay nhưng KHÔNG hề cộng tồn kho (nút cộng tồn kho bị ẩn vì
    -- status đã "completed"). Cột này derive giống orders.payment_status.
    alter table goods_receipts add column if not exists payment_status text not null default 'unpaid'
      check (payment_status in ('unpaid','partial','paid'));
    create index if not exists idx_goods_receipts_payment_status on goods_receipts(payment_status);

    -- Ghi nhớ tần suất 1 sản phẩm được thêm vào đơn hàng — ưu tiên gợi ý
    -- trong ô tìm sản phẩm ở /orders/new (xem app/api/orders/search-products).
    create table if not exists product_search_usage (
      product_id   uuid primary key references products(id) on delete cascade,
      use_count    integer not null default 0,
      last_used_at timestamptz not null default now()
    );
  `);

  // 17. Áp chênh lệch kiểm kê vào tồn kho (idempotency guard, giống
  // goods_receipt_items.stock_added_at) + Nhóm nhà cung cấp (mirror
  // customer_groups) + phí vận chuyển theo quy tắc (trước đây chỉ tồn tại
  // trong React state của trang /shipping/config, không có nơi lưu thật).
  await client.query(`
    alter table stock_check_items add column if not exists stock_applied_at timestamptz;
    create index if not exists idx_stock_check_items_stock_pending
      on stock_check_items(stock_applied_at) where stock_applied_at is null;

    create table if not exists supplier_groups (
      id          uuid primary key default gen_random_uuid(),
      name        text not null unique,
      code        text,
      description text,
      type        text default 'Cố định',
      created_at  timestamptz default now(),
      updated_at  timestamptz default now()
    );
    alter table suppliers add column if not exists group_id uuid references supplier_groups(id) on delete set null;
    create index if not exists idx_suppliers_group_id on suppliers(group_id);

    alter table shipping_settings add column if not exists fee_rules jsonb not null default '[]'::jsonb;
  `);

  // 18. Storefront (website bán hàng công khai) — xem STOREFRONT_PLAN.md.
  // Auth khách hàng KHÔNG dùng lại pattern cookie=UUID trần của staff (chấp
  // nhận được vì nội bộ) — storefront đối diện internet trực tiếp nên cần
  // token ngẫu nhiên + hash lưu DB (customer_sessions), cookie chỉ chứa token.
  await client.query(`
    alter table customers add column if not exists password_hash text;

    create table if not exists customer_sessions (
      id           uuid primary key default gen_random_uuid(),
      customer_id  uuid not null references customers(id) on delete cascade,
      token_hash   text not null unique,
      user_agent   text,
      created_at   timestamptz not null default now(),
      expires_at   timestamptz not null
    );
    create index if not exists idx_customer_sessions_customer_id on customer_sessions(customer_id);
    create index if not exists idx_customer_sessions_expires_at  on customer_sessions(expires_at);

    -- Cấu hình nội dung trang chủ storefront — 1 dòng duy nhất, mirror
    -- shipping_settings.
    create table if not exists site_settings (
      id                    int primary key default 1,
      store_name            text not null default 'Cửa hàng',
      banner_url            text not null default '',
      hero_title            text not null default '',
      hero_subtitle         text not null default '',
      announcement          text not null default '',
      contact_phone         text not null default '',
      contact_address       text not null default '',
      featured_category_ids uuid[] not null default '{}',
      featured_product_ids  uuid[] not null default '{}',
      updated_at            timestamptz not null default now(),
      constraint site_settings_singleton check (id = 1)
    );

    -- Phương thức thanh toán của đơn hàng — trước đây orders không phân biệt
    -- COD / chuyển khoản / thẻ. Cần để xử lý luồng khác nhau: COD thì
    -- payment_status chỉ chuyển 'paid' khi đã giao xong (thu tiền tại nhà);
    -- chuyển khoản/thẻ thì có thể 'paid' ngay từ lúc xác nhận đơn, trong khi
    -- fulfillment_status vẫn 'chưa giao'.
    alter table orders add column if not exists payment_method text not null default 'cod'
      check (payment_method in ('cod', 'bank_transfer', 'card', 'cash'));

    -- Mở rộng pipeline xử lý đơn: thêm 'confirmed' (đã xác nhận) và 'packing'
    -- (đang đóng gói) giữa 'unshipped' và 'shipping' — trước đây chỉ có 4
    -- trạng thái, thiếu 2 bước xử lý nội bộ trước khi giao.
    alter table orders drop constraint if exists orders_fulfillment_status_check;
    alter table orders add constraint orders_fulfillment_status_check
      check (fulfillment_status in ('unshipped', 'confirmed', 'packing', 'shipping', 'shipped', 'returned'));

    -- Backfill slug cho sản phẩm cũ chưa có (bắt buộc để lộ ra trang chi tiết
    -- sản phẩm /products/[slug] trên storefront). Hậu tố 8 ký tự từ id để
    -- đảm bảo unique tuyệt đối, không cần tính collision giữa các tên trùng.
    update products
    set slug = regexp_replace(regexp_replace(lower(unaccent(coalesce(name, 'san-pham'))), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')
               || '-' || substr(id::text, 1, 8)
    where slug is null;

    update categories
    set slug = regexp_replace(regexp_replace(lower(unaccent(coalesce(name, 'danh-muc'))), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')
               || '-' || substr(id::text, 1, 8)
    where slug is null;

    -- Mặc định đưa toàn bộ sản phẩm "active" ĐÃ CÓ TRƯỚC khi triển khai
    -- storefront lên website luôn (thay vì storefront trống trơn tới khi
    -- admin bấm "hiển thị" từng sản phẩm). Chốt mốc created_at cứng (không
    -- dùng now()) để migrate() chạy lại lần sau (mỗi lần server khởi động)
    -- KHÔNG tự publish sản phẩm mới tạo sau mốc này — những sản phẩm đó phải
    -- qua toggle "Hiển thị trên website" ở trang sửa sản phẩm (Task P4).
    update products set published_at = created_at
      where status = 'active' and published_at is null and created_at < '2026-07-10'::timestamptz;
  `);

  // 19. Liên kết Nhà cung cấp ↔ Sản phẩm — trước đây chỉ suy ra được "NCC nào
  // từng bán SP nào" qua lịch sử purchase_orders/goods_receipts, không có
  // bảng catalog trực tiếp để trang /suppliers quản lý "NCC này đang cung cấp
  // mặt hàng gì trong kho hiện tại".
  await client.query(`
    create table if not exists product_suppliers (
      id            uuid primary key default gen_random_uuid(),
      product_id    uuid not null references products(id) on delete cascade,
      supplier_id   uuid not null references suppliers(id) on delete cascade,
      supplier_sku  text default '',
      cost_price    numeric(18,2),
      is_preferred  boolean not null default false,
      note          text default '',
      created_at    timestamptz not null default now(),
      updated_at    timestamptz not null default now(),
      unique (product_id, supplier_id)
    );
    create index if not exists idx_product_suppliers_product  on product_suppliers(product_id);
    create index if not exists idx_product_suppliers_supplier on product_suppliers(supplier_id);
  `);

  // 20. Phân biệt đơn tạo từ trang POS (/pos) với đơn tạo tại quầy qua form
  // /orders/new — trước đây cả 2 đều dùng chung source='store' nên không lọc
  // riêng được đơn POS. Thêm 'pos' vào enum source.
  await client.query(`
    alter table orders drop constraint if exists orders_source_check;
    alter table orders add constraint orders_source_check
      check (source in ('store', 'facebook', 'website', 'zalo', 'other', 'pos'));

    -- Backfill 1 lần: đơn POS tạo TRƯỚC migration này không có cách nào phân
    -- biệt được với đơn 'store' thường qua field chính thức nào (source đều
    -- là 'store'). Dấu hiệu duy nhất đang có là branch — POS hardcode branch
    -- "Chi nhánh mặc định" (xem app/(dashboard)/pos/page.tsx, BRANCH_NAME),
    -- trong khi /orders/new chỉ cho chọn "Chi nhánh chính" / "Chi nhánh trung
    -- tâm" / "Kho Quận 1" (không bao giờ ra "Chi nhánh mặc định"). Dùng tạm
    -- dấu hiệu này để gắn lại nhãn 'pos' cho dữ liệu lịch sử.
    update orders set source = 'pos'
      where source = 'store' and branch = 'Chi nhánh mặc định';
  `);

  // 21. Chiết khấu từng sản phẩm trong đơn (POS) — trước đây chỉ có chiết
  // khấu tổng đơn (orders.discount), không lưu được chiết khấu theo dòng
  // (vd giảm 5% riêng cho 1 sản phẩm). discount_value là con số người dùng
  // nhập (đơn vị phụ thuộc discount_type) — lưu nguyên để hiển thị lại đúng
  // ("10%" chứ không quy đổi mất về số tiền) khi xem/sửa đơn sau này.
  await client.query(`
    alter table order_items add column if not exists discount_type text not null default 'amount'
      check (discount_type in ('amount', 'percent'));
    alter table order_items add column if not exists discount_value numeric(18,2) not null default 0;
  `);

  // 22. Lịch sử kho (stock movement ledger) — trước đây products.stock bị
  // UPDATE trực tiếp ở nhiều nơi (đơn hàng, nhập kho, kiểm kho) mà không ghi
  // lại ai/khi nào/vì sao. Bảng này là log append-only cho tab "Lịch sử kho"
  // ở trang chi tiết sản phẩm — mọi điểm trừ/cộng products.stock từ nay ghi
  // 1 dòng vào đây (xem lib/orders/repository.ts, lib/inventory/receipts.ts,
  // lib/goods-receipts/repository.ts, lib/stock-checks/repository.ts).
  await client.query(`
    create table if not exists stock_movements (
      id               uuid primary key default gen_random_uuid(),
      product_id       uuid not null references products(id) on delete cascade,
      movement_type    text not null
                       check (movement_type in (
                         'initial', 'order_sale', 'order_restore',
                         'goods_receipt', 'goods_receipt_reverse',
                         'stock_check', 'stock_receipt'
                       )),
      quantity_change  numeric(18,3) not null,
      resulting_stock  numeric(18,3) not null,
      reference_table  text,
      reference_id     uuid,
      reference_code   text,
      customer_name    text,
      staff            text,
      branch           text,
      note             text,
      created_at       timestamptz not null default now()
    );
    create index if not exists idx_stock_movements_product
      on stock_movements(product_id, created_at desc, id desc);
  `);

  // Backfill 1 lần duy nhất (guard bằng "bảng còn trống") — dựng lại lịch sử
  // cũ từ các bảng đã có sẵn dấu vết (goods_receipt_items.stock_added_at,
  // order_items.stock_deducted_at, stock_check_items.stock_applied_at,
  // stock_receipt_items). Dòng "initial" bù phần chênh lệch còn lại giữa
  // products.stock hiện tại và tổng các movement dựng được, để tổng luôn
  // khớp tồn kho thật kể cả với thay đổi không còn dấu vết nào (ví dụ sản
  // phẩm được set tồn kho ban đầu qua đường không được log ở đây).
  await client.query(`
    do $$
    begin
      if not exists (select 1 from stock_movements limit 1) then

        insert into stock_movements
          (product_id, movement_type, quantity_change, resulting_stock,
           reference_table, reference_id, reference_code, customer_name, staff, branch, created_at)
        select
          gri.product_id, 'goods_receipt', gri.received_qty, 0,
          'goods_receipts', gr.id, gr.code, null, gr.staff, gr.branch, gri.stock_added_at
        from goods_receipt_items gri
        join goods_receipts gr on gr.id = gri.goods_receipt_id
        where gri.stock_added_at is not null and gri.product_id is not null and gri.received_qty <> 0;

        insert into stock_movements
          (product_id, movement_type, quantity_change, resulting_stock,
           reference_table, reference_id, reference_code, customer_name, staff, branch, created_at)
        select
          oi.product_id, 'order_sale', -oi.quantity, 0,
          'orders', o.id, o.code, o.customer_name, o.staff, o.branch, oi.stock_deducted_at
        from order_items oi
        join orders o on o.id = oi.order_id
        where oi.stock_deducted_at is not null and oi.product_id is not null and oi.quantity <> 0;

        insert into stock_movements
          (product_id, movement_type, quantity_change, resulting_stock,
           reference_table, reference_id, reference_code, customer_name, staff, branch, created_at)
        select
          sci.product_id, 'stock_check', sci.variance, 0,
          'stock_checks', sc.id, sc.code, null, sc.staff, sc.branch, sci.stock_applied_at
        from stock_check_items sci
        join stock_checks sc on sc.id = sci.stock_check_id
        where sci.stock_applied_at is not null and sci.product_id is not null and sci.variance <> 0;

        insert into stock_movements
          (product_id, movement_type, quantity_change, resulting_stock,
           reference_table, reference_id, reference_code, customer_name, staff, branch, created_at)
        select
          sri.product_id, 'stock_receipt', sri.quantity, 0,
          'stock_receipts', sr.id, sr.code, null, sr.staff, sr.branch, sri.created_at
        from stock_receipt_items sri
        join stock_receipts sr on sr.id = sri.receipt_id
        where sri.product_id is not null and sri.quantity <> 0;

        insert into stock_movements
          (product_id, movement_type, quantity_change, resulting_stock, created_at)
        select
          p.id, 'initial', p.stock - coalesce(m.total, 0), 0,
          least(p.created_at, coalesce(m.min_created_at, p.created_at) - interval '1 second')
        from products p
        left join (
          select product_id, sum(quantity_change) as total, min(created_at) as min_created_at
          from stock_movements
          group by product_id
        ) m on m.product_id = p.id
        where p.stock - coalesce(m.total, 0) <> 0;

        update stock_movements sm
        set resulting_stock = running.cum
        from (
          select id, sum(quantity_change) over (
            partition by product_id order by created_at, id
          ) as cum
          from stock_movements
        ) running
        where running.id = sm.id;

      end if;
    end $$;
  `);

  // 23. Chiết khấu đơn hàng theo % hoặc số tiền cố định — trước đây
  // orders.discount luôn là số tiền cố định (line-item đã có discount_type
  // ở mục 21, order-level thì chưa). Xem lib/orders/repository.ts.
  await client.query(`
    alter table orders add column if not exists discount_type text not null default 'amount'
      check (discount_type in ('amount', 'percent'));
  `);
} finally {
    await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

