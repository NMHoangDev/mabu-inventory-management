// Check & create customer tables (CommonJS)
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Read .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  });
}

const sql = `
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

insert into customer_groups (name, description)
values ('Bán lẻ', 'Khách hàng bán lẻ mặc định')
on conflict (name) do nothing;
`;

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  console.log("Connecting to:", url.split("@")[1] || "(hidden)");

  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const before = await pool.query(
      `select table_name from information_schema.tables
       where table_schema='public' and table_name in ('customers','customer_groups','customer_addresses')
       order by table_name`
    );
    console.log("BEFORE:", before.rows.map((r) => r.table_name));

    await pool.query(sql);
    console.log("Migration applied.");

    const after = await pool.query(
      `select table_name from information_schema.tables
       where table_schema='public' and table_name in ('customers','customer_groups','customer_addresses')
       order by table_name`
    );
    console.log("AFTER:", after.rows.map((r) => r.table_name));

    const groups = await pool.query("select name, description from customer_groups order by name");
    console.log("Groups:", groups.rows);
  } catch (e) {
    console.error("FAIL:", e.message);
  } finally {
    await pool.end();
  }
})();
