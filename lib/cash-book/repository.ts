import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export type VoucherType = "receipt" | "payment";
export type VoucherStatus = "draft" | "completed" | "cancelled";

export type PaymentType = "" | "order_payment" | "supplier_payment" | "other" | "refund";

export interface CashBookEntry {
  id: string;
  code: string;
  voucher_type: VoucherType;
  payment_type: PaymentType;
  payment_category: string;
  group_name: string;
  person_name: string;
  reference_code: string;
  reference_type: string;
  payment_method: string;
  amount: number;
  branch: string;
  recorded_date: string;
  note: string;
  tags: string[];
  debt_change: boolean;
  business_acc: boolean;
  status: VoucherStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CashBookListRow {
  id: string;
  code: string;
  voucher_type: VoucherType;
  payment_type: PaymentType;
  payment_category: string;
  group_name: string;
  person_name: string;
  reference_code: string;
  reference_type: string;
  payment_method: string;
  recorded_date: string;
  note: string;
  created_by: string;
  amount: number;
  status: VoucherStatus;
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

function rowToListRow(row: any): CashBookListRow {
  return {
    id: row.id,
    code: str(row.code),
    voucher_type: row.voucher_type,
    payment_type: row.payment_type ?? "",
    payment_category: str(row.payment_category, "Tự động"),
    group_name: str(row.group_name),
    person_name: str(row.person_name),
    reference_code: str(row.reference_code),
    reference_type: str(row.reference_type),
    payment_method: str(row.payment_method, "Tiền mặt"),
    recorded_date: row.recorded_date ?? "",
    note: str(row.note),
    created_by: str(row.created_by),
    amount: num(row.amount),
    status: row.status,
    created_at: row.created_at
  };
}

function rowToEntry(row: any): CashBookEntry {
  return {
    id: row.id,
    code: str(row.code),
    voucher_type: row.voucher_type,
    payment_type: row.payment_type ?? "",
    payment_category: str(row.payment_category, "Tự động"),
    group_name: str(row.group_name),
    person_name: str(row.person_name),
    reference_code: str(row.reference_code),
    reference_type: str(row.reference_type),
    payment_method: str(row.payment_method, "Tiền mặt"),
    amount: num(row.amount),
    branch: str(row.branch, "Chi nhánh mặc định"),
    recorded_date: row.recorded_date ?? "",
    note: str(row.note),
    tags: Array.isArray(row.tags) ? row.tags : [],
    debt_change: row.debt_change ?? true,
    business_acc: row.business_acc ?? true,
    status: row.status,
    created_by: str(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function listCashBookEntries(args?: {
  voucher_type?: VoucherType;
  status?: VoucherStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: CashBookListRow[]; total: number }> {
  if (!isDatabaseConfigured) return { rows: [], total: 0 };
  await ensureDatabase();
  const pool = getPool();
  const vt = args?.voucher_type;
  const status = args?.status;
  const q = args?.search?.trim() || "";
  const page = Math.max(1, args?.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, args?.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  let whereClause = "where 1=1";
  const params: any[] = [];
  let idx = 1;

  if (vt) {
    whereClause += ` and voucher_type = $${idx++}`;
    params.push(vt);
  }
  if (status) {
    whereClause += ` and status = $${idx++}`;
    params.push(status);
  }
  if (q) {
    whereClause += ` and (code ilike $${idx} or person_name ilike $${idx} or reference_code ilike $${idx} or note ilike $${idx})`;
    params.push(`%${q}%`);
    idx++;
  }

  const countResult = await pool.query(
    `select count(*)::int as cnt from cash_book ${whereClause}`,
    params
  );
  const total = countResult.rows[0]?.cnt ?? 0;

  const rowsResult = await pool.query(
    `select id, code, voucher_type, payment_type, payment_category, group_name, person_name,
            reference_code, reference_type, payment_method, recorded_date, note, created_by,
            amount, status, created_at
     from cash_book
     ${whereClause}
     order by created_at desc
     limit $${idx} offset $${idx + 1}`,
    [...params, pageSize, offset]
  );

  return { rows: rowsResult.rows.map(rowToListRow), total };
}

export async function getCashBookEntry(id: string): Promise<CashBookEntry | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const pool = getPool();
  const result = isUuid(id)
    ? await pool.query(`select * from cash_book where id = $1::uuid limit 1`, [id])
    : await pool.query(`select * from cash_book where code = $1 limit 1`, [id]);
  if (result.rows.length === 0) return null;
  return rowToEntry(result.rows[0]);
}

export async function getNextCashBookCode(voucherType: VoucherType = "receipt"): Promise<string> {
  if (!isDatabaseConfigured) return voucherType === "receipt" ? "RVN00001" : "PVN00001";
  await ensureDatabase();
  const pool = getPool();
  const prefix = voucherType === "receipt" ? "RVN" : "PVN";
  const result = await pool.query(
    `select code from cash_book
     where voucher_type = $1 and code ~ $2
     order by length(code) desc, code desc
     limit 1`,
    [voucherType, `^${prefix}[0-9]+$`]
  );
  if (result.rows.length === 0) return `${prefix}00001`;
  const current = String(result.rows[0].code);
  const numPart = parseInt(current.replace(/\D/g, ""), 10);
  if (!Number.isFinite(numPart)) return `${prefix}00001`;
  return `${prefix}${String(numPart + 1).padStart(5, "0")}`;
}

export interface CreateCashBookEntryInput {
  voucher_type?: VoucherType;
  payment_type?: PaymentType;
  payment_category?: string;
  group_name?: string;
  person_name?: string;
  reference_code?: string;
  reference_type?: string;
  payment_method?: string;
  amount?: number;
  branch?: string;
  recorded_date?: string;
  note?: string;
  tags?: string[];
  debt_change?: boolean;
  business_acc?: boolean;
  status?: VoucherStatus;
  created_by?: string;
}

export async function createCashBookEntry(input: CreateCashBookEntryInput): Promise<CashBookEntry> {
  if (!isDatabaseConfigured) throw new Error("Database chưa được cấu hình.");
  await ensureDatabase();
  const pool = getPool();
  const vt = input.voucher_type ?? "receipt";
  const code = await getNextCashBookCode(vt);
  const result = await pool.query(
    `insert into cash_book (
      code, voucher_type, payment_type, payment_category, group_name, person_name,
      reference_code, reference_type, payment_method, amount, branch, recorded_date,
      note, tags, debt_change, business_acc, status, created_by
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     returning *`,
    [
      code, vt,
      str(input.payment_type, ""),
      str(input.payment_category, "Tự động"),
      str(input.group_name),
      str(input.person_name),
      str(input.reference_code),
      str(input.reference_type),
      str(input.payment_method, "Tiền mặt"),
      num(input.amount),
      str(input.branch, "Chi nhánh mặc định"),
      input.recorded_date || new Date().toISOString().slice(0, 10),
      str(input.note),
      input.tags ?? [],
      input.debt_change ?? true,
      input.business_acc ?? true,
      input.status ?? "completed",
      str(input.created_by)
    ]
  );
  return rowToEntry(result.rows[0]);
}

export async function updateCashBookEntry(id: string, input: Partial<CreateCashBookEntryInput>): Promise<CashBookEntry> {
  if (!isDatabaseConfigured) throw new Error("Database chưa được cấu hình.");
  await ensureDatabase();
  const pool = getPool();
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const set = (name: string, val: any) => {
    if (val !== undefined) { fields.push(`${name} = $${idx++}`); values.push(val); }
  };

  set("payment_type", input.payment_type);
  set("payment_category", input.payment_category);
  set("group_name", input.group_name);
  set("person_name", input.person_name);
  set("reference_code", input.reference_code);
  set("reference_type", input.reference_type);
  set("payment_method", input.payment_method);
  set("amount", input.amount);
  set("branch", input.branch);
  set("recorded_date", input.recorded_date);
  set("note", input.note);
  set("status", input.status);
  values.push(id);

  const result = await pool.query(
    `update cash_book set ${fields.join(", ")}, updated_at = now() where id = $${idx} returning *`,
    values
  );
  if (result.rows.length === 0) throw new Error("Không tìm thấy phiếu.");
  return rowToEntry(result.rows[0]);
}

export async function deleteCashBookEntry(id: string): Promise<void> {
  if (!isDatabaseConfigured) return;
  await ensureDatabase();
  const pool = getPool();
  await pool.query(`delete from cash_book where id = $1`, [id]);
}

export interface PaymentMethodBalance {
  method: string;
  total_receipts: number;
  total_payments: number;
  balance: number;
}

export async function getCashBalanceByMethod(): Promise<PaymentMethodBalance[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const result = await pool.query(
    `select
       case
         when payment_method = 'Tiền mặt' then 'Tiền mặt'
         when payment_method = 'Chuyển khoản' then 'Chuyển khoản'
         else 'Khác'
       end as method,
       sum(case when voucher_type = 'receipt' then amount else 0 end) as total_receipts,
       sum(case when voucher_type = 'payment' then amount else 0 end) as total_payments,
       sum(case when voucher_type = 'receipt' then amount else -amount end) as balance
     from cash_book
     where status = 'completed'
     group by method
     order by method`
  );
  return result.rows.map((row: any) => ({
    method: str(row.method, "Khác"),
    total_receipts: num(row.total_receipts),
    total_payments: num(row.total_payments),
    balance: num(row.balance)
  }));
}
