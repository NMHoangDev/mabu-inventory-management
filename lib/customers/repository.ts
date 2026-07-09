import { getPool, isDatabaseConfigured, logActivity } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const dataDir = process.env.INVOICEFLOW_DATA_DIR
  ?? (process.env.VERCEL ? path.join(os.tmpdir(), "invoiceflow") : path.join(process.cwd(), "data"));
const customersFilePath = path.join(dataDir, "customers-store.json");

async function getOfflineCustomers(): Promise<unknown[]> {
  try {
    const raw = await fs.readFile(customersFilePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveOfflineCustomers(customers: unknown[]) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(customersFilePath, JSON.stringify(customers, null, 2), "utf8");
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CustomerGroup {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerAddress {
  id?: string;
  customer_id?: string;
  is_default?: boolean;
  recipient_name?: string;
  phone?: string;
  address?: string;
  ward?: string;
  district?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  address_type?: "shipping" | "billing" | "other";
}

export interface CustomerInput {
  id?: string;
  code?: string;
  name: string;
  phone?: string;
  email?: string;
  gender?: "male" | "female" | "other";
  birthday?: string;
  company?: string;
  tax_code?: string;
  website?: string;
  description?: string;
  tags?: string[];
  group_id?: string | null;
  assigner_id?: string;
  addresses?: CustomerAddress[];
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  gender: "male" | "female" | "other" | "";
  birthday: string;
  company: string;
  tax_code: string;
  website: string;
  description: string;
  tags: string[];
  group_id: string;
  assigner_id: string;
  total_spent: number;
  total_orders: number;
  total_debt: number;
  last_order_at: string;
  created_at: string;
  updated_at: string;
  group_name?: string;
  default_address?: CustomerAddress;
  has_account?: boolean;
}

// Cột thật của bảng customers, liệt kê rõ (không dùng `c.*`) để KHÔNG bao giờ
// vô tình trả password_hash ra API — trang quản lý khách hàng chỉ cần biết
// "đã có tài khoản web hay chưa" qua has_account, không cần/được thấy hash.
const CUSTOMER_COLUMNS = `
  c.id, c.code, c.name, c.phone, c.email, c.gender, c.birthday, c.company,
  c.tax_code, c.website, c.description, c.tags, c.group_id, c.assigner_id,
  c.total_spent, c.total_orders, c.total_debt, c.birth_day, c.birth_month,
  c.last_order_at, c.created_at, c.updated_at, (c.password_hash is not null) as has_account
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDate(raw: unknown): string {
  if (!raw) return "";
  if (raw instanceof Date) return raw.toISOString().split("T")[0];
  if (typeof raw === "string") return raw.split("T")[0];
  return String(raw);
}

function cell(val: unknown): string {
  return val == null ? "" : String(val);
}

// `insert/select ... returning *` vẫn phải chạm password_hash thật (không chỉ
// null) khi khách đã đăng ký web rồi được admin sửa hồ sơ — xoá field này
// khỏi object trước khi trả ra, tương tự lý do CUSTOMER_COLUMNS tồn tại.
function stripPasswordHash<T extends Record<string, unknown>>(row: T): Omit<T, "password_hash"> & { has_account: boolean } {
  const { password_hash, ...rest } = row as Record<string, unknown> & { password_hash?: string | null };
  return { ...(rest as Omit<T, "password_hash">), has_account: Boolean(password_hash) };
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export interface CustomerGroupWithCount extends CustomerGroup {
  code: string;
  type: string;
  customer_count: number;
}

export async function getCustomerGroups(): Promise<CustomerGroup[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(
    `select id, name, description, created_at, updated_at from customer_groups order by name asc`,
  );
  return res.rows as CustomerGroup[];
}

export async function getCustomerGroupsWithCount(): Promise<CustomerGroupWithCount[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(`
    select
      g.id,
      g.name,
      g.code,
      g.type,
      g.description,
      g.created_at,
      g.updated_at,
      coalesce(c.cnt, 0)::int as customer_count
    from customer_groups g
    left join (
      select group_id, count(*)::int as cnt
      from customers
      where group_id is not null
      group by group_id
    ) c on c.group_id = g.id
    order by g.created_at asc
  `);
  return res.rows as CustomerGroupWithCount[];
}

export interface CustomerGroupInput {
  name: string;
  code?: string;
  type?: string;
  description?: string;
}

function slugifyCode(name: string, fallback: string) {
  const s = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
  return s || fallback;
}

export async function createCustomerGroup(input: CustomerGroupInput): Promise<CustomerGroupWithCount> {
  const pool = getPool();
  await ensureDatabase();
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Auto-generate code if missing
    let code = (input.code || "").trim();
    if (!code) {
      const c = await client.query(
        `select count(*)::int as cnt from customer_groups where code like $1`,
        [`${slugifyCode(input.name, "GR")}%`],
      );
      const suffix = c.rows[0].cnt + 1;
      code = `${slugifyCode(input.name, "GR")}${suffix.toString().padStart(3, "0")}`;
    }

    const res = await client.query(
      `insert into customer_groups (name, code, type, description, created_at, updated_at)
       values ($1, $2, $3, $4, now(), now())
       returning *`,
      [input.name.trim(), code, input.type || "Cố định", input.description || ""],
    );

    await client.query("commit");
    await logActivity("customer_group", `Tạo nhóm khách hàng ${input.name} (${code})`);

    const row = res.rows[0] as CustomerGroupWithCount;
    return { ...row, customer_count: 0 };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateCustomerGroup(
  id: string,
  input: CustomerGroupInput
): Promise<CustomerGroupWithCount | null> {
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update customer_groups set
         name = $2,
         code = $3,
         type = $4,
         description = $5,
         updated_at = now()
       where id = $1`,
      [id, input.name.trim(), input.code || "", input.type || "Cố định", input.description || ""]
    );
    await client.query("commit");
    await logActivity("customer_group", `Cập nhật nhóm khách hàng ${input.name}`);

    const res = await pool.query(
      `select g.*, coalesce(c.cnt, 0)::int as customer_count
       from customer_groups g
       left join (select group_id, count(*) as cnt from customers where group_id is not null group by group_id) c
         on c.group_id = g.id
       where g.id = $1`,
      [id]
    );
    return (res.rows[0] as CustomerGroupWithCount) ?? null;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteCustomerGroup(id: string): Promise<boolean> {
  await ensureDatabase();
  const pool = getPool();
  // Note: customers.group_id has ON DELETE SET NULL, so customers will keep but lose their group_id
  const res = await pool.query(`delete from customer_groups where id = $1`, [id]);
  if ((res.rowCount ?? 0) > 0) {
    await logActivity("customer_group", `Xoá nhóm khách hàng ID: ${id}`);
  }
  return (res.rowCount ?? 0) > 0;
}

// ─── Auto-generate customer code ────────────────────────────────────────────

async function nextCustomerCode(pool: ReturnType<typeof getPool>): Promise<string> {
  const res = await pool.query(
    `select max(substring(code from 'CUZN(\\d+)'))::bigint as max_num from customers where code ~ '^CUZN\\d+$'`,
  );
  const next = (Number(res.rows[0]?.max_num ?? 0) + 1).toString().padStart(5, "0");
  return `CUZN${next}`;
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function getCustomers(opts: {
  search?: string;
  group_id?: string;
  tab?: string;
} = {}): Promise<Customer[]> {
  const { search = "", group_id, tab } = opts;

  if (!isDatabaseConfigured) {
    const all = await getOfflineCustomers() as Customer[];
    return filterCustomers(all, search, group_id, tab);
  }

  await ensureDatabase();
  const pool = getPool();

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (search.trim()) {
    conditions.push(
      `(lower(c.name) like $${idx} or lower(c.code) like $${idx} or replace(c.phone, ' ', '') like $${idx})`,
    );
    params.push(`%${search.trim().toLowerCase()}%`);
    idx++;
  }

  if (group_id) {
    conditions.push(`c.group_id = $${idx++}`);
    params.push(group_id);
  }

  const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  const res = await pool.query(`
    select
      ${CUSTOMER_COLUMNS},
      cg.name as group_name,
      ca.id          as addr_id,
      ca.recipient_name as addr_recipient_name,
      ca.phone        as addr_phone,
      ca.address      as addr_address,
      ca.ward         as addr_ward,
      ca.district     as addr_district,
      ca.city         as addr_city,
      ca.region       as addr_region
    from customers c
    left join customer_groups cg on cg.id = c.group_id
    left join lateral (
      select id, recipient_name, phone, address, ward, district, city, region
      from customer_addresses
      where customer_id = c.id and is_default = true
      limit 1
    ) ca on true
    ${whereClause}
    order by c.created_at desc
    limit 500
  `, params);

  return ((res.rows as unknown as (Customer & {
    addr_id?: string;
    addr_recipient_name?: string;
    addr_phone?: string;
    addr_address?: string;
    addr_ward?: string;
    addr_district?: string;
    addr_city?: string;
    addr_region?: string;
  })[])).map((r) => ({
    ...r,
    birthday: parseDate(r.birthday),
    last_order_at: r.last_order_at ?? "",
    default_address: r.addr_id
      ? {
          id: r.addr_id,
          recipient_name: r.addr_recipient_name,
          phone: r.addr_phone,
          address: r.addr_address,
          ward: r.addr_ward,
          district: r.addr_district,
          city: r.addr_city,
          region: r.addr_region,
        }
      : undefined,
  }));
}

function filterCustomers(
  customers: Customer[],
  search: string,
  group_id?: string,
  tab?: string,
): Customer[] {
  let result = customers;
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.code ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").replace(/\s/g, "").includes(q),
    );
  }
  if (group_id) {
    result = result.filter((c) => c.group_id === group_id);
  }
  return result;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const pool = getPool();

  if (!isDatabaseConfigured) {
    const customers = await getOfflineCustomers() as Customer[];
    const newCustomer: Customer = {
      ...input,
      id: crypto.randomUUID(),
      code: input.code || `CUZN${String(customers.length + 1).padStart(5, "0")}`,
      name: input.name,
      phone: input.phone || "",
      email: input.email || "",
      gender: input.gender || "",
      birthday: input.birthday || "",
      company: input.company || "",
      tax_code: input.tax_code || "",
      website: input.website || "",
      description: input.description || "",
      tags: input.tags || [],
      group_id: input.group_id || "",
      assigner_id: input.assigner_id || "",
      total_spent: 0,
      total_orders: 0,
      total_debt: 0,
      last_order_at: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    customers.push(newCustomer);
    await saveOfflineCustomers(customers);
    return newCustomer;
  }

  await ensureDatabase();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const code = input.code || await nextCustomerCode(pool);
    const hasAddress = Array.isArray(input.addresses) && input.addresses.length > 0;

    // Pre-compute day/month from birthday, since extract() returns integer.
    const bd = input.birthday && input.birthday.length > 0 ? new Date(input.birthday) : null;
    const birthDay = bd && !isNaN(bd.getTime()) ? bd.getUTCDate() : null;
    const birthMonth = bd && !isNaN(bd.getTime()) ? bd.getUTCMonth() + 1 : null;

    const row = await client.query(`
      insert into customers (
        code, name, phone, email, gender, birthday, company, tax_code, website,
        description, tags, group_id, assigner_id, total_spent, total_orders, total_debt,
        birth_day, birth_month, created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, 0, 0,
        $14, $15, now(), now()
      )
      returning *
    `, [
      code,
      input.name.trim(),
      cell(input.phone),
      cell(input.email),
      input.gender || null,
      input.birthday || null,
      cell(input.company),
      cell(input.tax_code),
      cell(input.website),
      cell(input.description),
      input.tags || [],
      input.group_id || null,
      cell(input.assigner_id),
      birthDay,
      birthMonth,
    ]);

    const customer = stripPasswordHash(row.rows[0]) as Customer;

    if (hasAddress) {
      for (const addr of input.addresses!) {
        await client.query(`
          insert into customer_addresses (
            customer_id, is_default, recipient_name, phone, address,
            ward, district, city, region, postal_code, address_type, created_at, updated_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
        `, [
          customer.id,
          addr.is_default ?? false,
          cell(addr.recipient_name),
          cell(addr.phone),
          cell(addr.address),
          cell(addr.ward),
          cell(addr.district),
          cell(addr.city),
          cell(addr.region),
          cell(addr.postal_code),
          addr.address_type || "shipping",
        ]);
      }
    }

    await client.query("commit");
    await logActivity("customer", `Tạo khách hàng ${input.name} (${code})`);
    return customer as Customer;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<Customer | null> {
  const pool = getPool();

  if (!isDatabaseConfigured) {
    const customers = await getOfflineCustomers() as Customer[];
    const idx = customers.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const updated: Customer = {
      ...customers[idx],
      ...input,
      id,
      group_id: input.group_id ?? "",
      gender: (input.gender as Customer["gender"]) ?? customers[idx].gender,
      updated_at: new Date().toISOString(),
    };
    customers[idx] = updated;
    await saveOfflineCustomers(customers);
    return updated;
  }

  await ensureDatabase();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const bd = input.birthday && input.birthday.length > 0 ? new Date(input.birthday) : null;
    const birthDay = bd && !isNaN(bd.getTime()) ? bd.getUTCDate() : null;
    const birthMonth = bd && !isNaN(bd.getTime()) ? bd.getUTCMonth() + 1 : null;

    await client.query(`
      update customers set
        name         = $2,
        phone        = $3,
        email        = $4,
        gender       = $5,
        birthday     = $6,
        company      = $7,
        tax_code     = $8,
        website      = $9,
        description  = $10,
        tags         = $11,
        group_id     = $12,
        assigner_id  = $13,
        birth_day    = $14,
        birth_month  = $15,
        updated_at   = now()
      where id = $1
    `, [
      id,
      input.name.trim(),
      cell(input.phone),
      cell(input.email),
      input.gender || null,
      input.birthday || null,
      cell(input.company),
      cell(input.tax_code),
      cell(input.website),
      cell(input.description),
      input.tags || [],
      input.group_id || null,
      cell(input.assigner_id),
      birthDay,
      birthMonth,
    ]);

    // Replace addresses if provided
    if (input.addresses !== undefined) {
      await client.query(`delete from customer_addresses where customer_id = $1`, [id]);
      for (const addr of input.addresses) {
        await client.query(`
          insert into customer_addresses (
            customer_id, is_default, recipient_name, phone, address,
            ward, district, city, region, postal_code, address_type, created_at, updated_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
        `, [
          id,
          addr.is_default ?? false,
          cell(addr.recipient_name),
          cell(addr.phone),
          cell(addr.address),
          cell(addr.ward),
          cell(addr.district),
          cell(addr.city),
          cell(addr.region),
          cell(addr.postal_code),
          addr.address_type || "shipping",
        ]);
      }
    }

    await client.query("commit");
    await logActivity("customer", `Cập nhật khách hàng ${input.name} (ID: ${id})`);

    const row = await pool.query(`select * from customers where id = $1`, [id]);
    return stripPasswordHash(row.rows[0]) as Customer;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteCustomer(id: string): Promise<boolean> {
  if (!isDatabaseConfigured) {
    const customers = await getOfflineCustomers() as Customer[];
    const filtered = customers.filter((c) => c.id !== id);
    if (filtered.length === customers.length) return false;
    await saveOfflineCustomers(filtered);
    return true;
  }

  await ensureDatabase();
  const pool = getPool();
  // Foreign key cascade will delete addresses
  const res = await pool.query(`delete from customers where id = $1`, [id]);
  if ((res.rowCount ?? 0) > 0) {
    await logActivity("customer", `Xoá khách hàng ID: ${id}`);
  }
  return (res.rowCount ?? 0) > 0;
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  if (!isDatabaseConfigured) {
    const customers = await getOfflineCustomers() as Customer[];
    return (customers.find((c) => c.id === id) as Customer) ?? null;
  }

  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(`
    select
      ${CUSTOMER_COLUMNS},
      cg.name as group_name,
      ca.id          as addr_id,
      ca.recipient_name as addr_recipient_name,
      ca.phone        as addr_phone,
      ca.address      as addr_address,
      ca.ward         as addr_ward,
      ca.district     as addr_district,
      ca.city         as addr_city,
      ca.region       as addr_region
    from customers c
    left join customer_groups cg on cg.id = c.group_id
    left join lateral (
      select id, recipient_name, phone, address, ward, district, city, region
      from customer_addresses
      where customer_id = c.id and is_default = true
      limit 1
    ) ca on true
    where c.id = $1
    limit 1
  `, [id]);

  if (!res.rows.length) return null;

  const r = res.rows[0] as unknown as Customer & {
    addr_id?: string;
    addr_recipient_name?: string;
    addr_phone?: string;
    addr_address?: string;
    addr_ward?: string;
    addr_district?: string;
    addr_city?: string;
    addr_region?: string;
  };

  return {
    ...r,
    birthday: parseDate(r.birthday),
    last_order_at: r.last_order_at ?? "",
    default_address: r.addr_id
      ? {
          id: r.addr_id,
          recipient_name: r.addr_recipient_name,
          phone: r.addr_phone,
          address: r.addr_address,
          ward: r.addr_ward,
          district: r.addr_district,
          city: r.addr_city,
          region: r.addr_region,
        }
      : undefined,
  };
}
