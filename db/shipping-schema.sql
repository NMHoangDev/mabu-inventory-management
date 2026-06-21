-- =====================================================================
-- InvoiceFlowManager - Shipping tables (Supabase / PostgreSQL)
-- Run on Supabase SQL editor or via psql
-- =====================================================================

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

-- Shipping settings (singleton row for store-wide shipping config)
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
