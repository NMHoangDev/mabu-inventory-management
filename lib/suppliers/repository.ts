import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  tax_code: string;
  address: string;
  ward: string;
  district: string;
  city: string;
  note: string;
  tags: string[];
  total_purchased: number;
  total_orders: number;
  last_order_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SupplierListRow {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  total_purchased: number;
  total_orders: number;
  last_order_at: string | null;
  created_at: string;
}

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function str(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function rowToSupplier(row: any): Supplier {
  return {
    id: row.id,
    code: str(row.code),
    name: str(row.name),
    contact_name: str(row.contact_name),
    phone: str(row.phone),
    email: str(row.email),
    tax_code: str(row.tax_code),
    address: str(row.address),
    ward: str(row.ward),
    district: str(row.district),
    city: str(row.city),
    note: str(row.note),
    tags: Array.isArray(row.tags) ? row.tags : [],
    total_purchased: num(row.total_purchased),
    total_orders: num(row.total_orders),
    last_order_at: row.last_order_at,
    status: str(row.status, "active"),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function listSuppliers(args?: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: SupplierListRow[]; total: number }> {
  if (!isDatabaseConfigured) return { rows: [], total: 0 };
  await ensureDatabase();
  const pool = getPool();
  const q = args?.search?.trim() || "";
  const status = args?.status;
  const page = Math.max(1, args?.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, args?.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  let whereClause = "where 1=1";
  const params: any[] = [];
  let paramIdx = 1;

  if (q) {
    whereClause += ` and (name ilike $${paramIdx} or code ilike $${paramIdx} or phone ilike $${paramIdx} or email ilike $${paramIdx})`;
    params.push(`%${q}%`);
    paramIdx++;
  }
  if (status) {
    whereClause += ` and status = $${paramIdx}`;
    params.push(status);
    paramIdx++;
  }

  const countResult = await pool.query(
    `select count(*)::int as cnt from suppliers ${whereClause}`,
    params
  );
  const total = countResult.rows[0]?.cnt ?? 0;

  const rowsResult = await pool.query(
    `select id, code, name, phone, email, status, total_purchased, total_orders, last_order_at, created_at
     from suppliers
     ${whereClause}
     order by created_at desc
     limit $${paramIdx} offset $${paramIdx + 1}`,
    [...params, pageSize, offset]
  );

  return {
    rows: rowsResult.rows.map((row) => ({
      id: row.id,
      code: str(row.code),
      name: str(row.name),
      phone: str(row.phone),
      email: str(row.email),
      status: str(row.status, "active"),
      total_purchased: num(row.total_purchased),
      total_orders: num(row.total_orders),
      last_order_at: row.last_order_at,
      created_at: row.created_at
    })),
    total
  };
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const pool = getPool();
  const result = isUuid(id)
    ? await pool.query(`select * from suppliers where id = $1::uuid limit 1`, [id])
    : await pool.query(`select * from suppliers where code = $1 limit 1`, [id]);
  if (result.rows.length === 0) return null;
  return rowToSupplier(result.rows[0]);
}

export async function getNextSupplierCode(): Promise<string> {
  if (!isDatabaseConfigured) return "SUPN00001";
  await ensureDatabase();
  const pool = getPool();
  const result = await pool.query(`
    select code from suppliers
    where code ~ '^SUPN[0-9]+$'
    order by length(code) desc, code desc
    limit 1
  `);
  if (result.rows.length === 0) return "SUPN00001";
  const current = String(result.rows[0].code);
  const numPart = parseInt(current.replace(/\D/g, ""), 10);
  if (!Number.isFinite(numPart)) return "SUPN00001";
  return `SUPN${String(numPart + 1).padStart(5, "0")}`;
}

export interface CreateSupplierInput {
  name: string;
  code?: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  tax_code?: string;
  address?: string;
  ward?: string;
  district?: string;
  city?: string;
  note?: string;
  tags?: string[];
  status?: string;
}

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  if (!isDatabaseConfigured) throw new Error("Database chưa được cấu hình.");
  await ensureDatabase();
  const pool = getPool();
  const code = input.code?.trim() || (await getNextSupplierCode());
  const result = await pool.query(
    `insert into suppliers (code, name, contact_name, phone, email, tax_code, address, ward, district, city, note, tags, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning *`,
    [
      code,
      str(input.name),
      str(input.contact_name),
      str(input.phone),
      str(input.email),
      str(input.tax_code),
      str(input.address),
      str(input.ward),
      str(input.district),
      str(input.city),
      str(input.note),
      input.tags ?? [],
      str(input.status, "active")
    ]
  );
  return rowToSupplier(result.rows[0]);
}

export interface UpdateSupplierInput {
  name?: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  tax_code?: string;
  address?: string;
  ward?: string;
  district?: string;
  city?: string;
  note?: string;
  tags?: string[];
  status?: string;
}

export async function updateSupplier(id: string, input: UpdateSupplierInput): Promise<Supplier> {
  if (!isDatabaseConfigured) throw new Error("Database chưa được cấu hình.");
  await ensureDatabase();
  const pool = getPool();
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const setField = (name: string, value: any) => {
    if (value !== undefined) {
      fields.push(`${name} = $${idx}`);
      values.push(value);
      idx++;
    }
  };

  setField("name", input.name);
  setField("contact_name", input.contact_name);
  setField("phone", input.phone);
  setField("email", input.email);
  setField("tax_code", input.tax_code);
  setField("address", input.address);
  setField("ward", input.ward);
  setField("district", input.district);
  setField("city", input.city);
  setField("note", input.note);
  setField("tags", input.tags);
  setField("status", input.status);
  fields.push(`updated_at = now()`);

  values.push(id);
  const result = await pool.query(
    `update suppliers set ${fields.join(", ")} where id = $${idx} returning *`,
    values
  );
  if (result.rows.length === 0) throw new Error("Không tìm thấy nhà cung cấp.");
  return rowToSupplier(result.rows[0]);
}

export async function deleteSupplier(id: string): Promise<void> {
  if (!isDatabaseConfigured) return;
  await ensureDatabase();
  const pool = getPool();
  await pool.query(`delete from suppliers where id = $1::uuid`, [id]);
}

// ─── Groups (mirror lib/customers/repository.ts's customer_groups) ─────────
// Trước đây /suppliers/groups là trang tĩnh "đang xây dựng", không có API
// nào cả. suppliers.group_id + bảng supplier_groups mới thêm cùng migration
// SCHEMA_VERSION 20.

export interface SupplierGroup {
  id: string;
  name: string;
  code: string;
  type: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface SupplierGroupWithCount extends SupplierGroup {
  supplier_count: number;
}

export interface SupplierGroupInput {
  name: string;
  code?: string;
  type?: string;
  description?: string;
}

function slugifySupplierGroupCode(name: string, fallback: string) {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  return s || fallback;
}

export async function getSupplierGroupsWithCount(): Promise<SupplierGroupWithCount[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(`
    select
      g.id, g.name, g.code, g.type, g.description, g.created_at, g.updated_at,
      coalesce(s.cnt, 0)::int as supplier_count
    from supplier_groups g
    left join (
      select group_id, count(*)::int as cnt
      from suppliers
      where group_id is not null
      group by group_id
    ) s on s.group_id = g.id
    order by g.created_at asc
  `);
  return res.rows as SupplierGroupWithCount[];
}

export async function createSupplierGroup(input: SupplierGroupInput): Promise<SupplierGroupWithCount> {
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    let code = (input.code || "").trim();
    if (!code) {
      const c = await client.query(
        `select count(*)::int as cnt from supplier_groups where code like $1`,
        [`${slugifySupplierGroupCode(input.name, "NCC")}%`]
      );
      const suffix = c.rows[0].cnt + 1;
      code = `${slugifySupplierGroupCode(input.name, "NCC")}${suffix.toString().padStart(3, "0")}`;
    }

    const res = await client.query(
      `insert into supplier_groups (name, code, type, description, created_at, updated_at)
       values ($1, $2, $3, $4, now(), now())
       returning *`,
      [input.name.trim(), code, input.type || "Cố định", input.description || ""]
    );

    await client.query("commit");
    return { ...(res.rows[0] as SupplierGroup), supplier_count: 0 };
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSupplierGroup(
  id: string,
  input: SupplierGroupInput
): Promise<SupplierGroupWithCount | null> {
  await ensureDatabase();
  const pool = getPool();
  await pool.query(
    `update supplier_groups set
       name = $2, code = $3, type = $4, description = $5, updated_at = now()
     where id = $1`,
    [id, input.name.trim(), input.code || "", input.type || "Cố định", input.description || ""]
  );
  const res = await pool.query(
    `select g.*, coalesce(s.cnt, 0)::int as supplier_count
       from supplier_groups g
       left join (select group_id, count(*)::int as cnt from suppliers where group_id is not null group by group_id) s
         on s.group_id = g.id
      where g.id = $1`,
    [id]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0] as SupplierGroupWithCount;
}

export async function deleteSupplierGroup(id: string): Promise<boolean> {
  await ensureDatabase();
  const pool = getPool();
  // suppliers.group_id có ON DELETE SET NULL — NCC vẫn giữ nguyên, chỉ mất group_id.
  const res = await pool.query(`delete from supplier_groups where id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}
