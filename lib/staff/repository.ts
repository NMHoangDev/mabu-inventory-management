import { getPool } from "@/lib/db/connection";
import { hashPassword } from "@/lib/auth/password";

export type StaffRecord = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "staff";
  role_id: string | null;
  role_name: string | null;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateStaffInput = {
  email: string;
  full_name: string;
  role_id?: string | null;
  role?: "admin" | "staff";
  password?: string;
};

export type UpdateStaffInput = {
  email?: string;
  full_name?: string;
  role_id?: string | null;
  role?: "admin" | "staff";
  is_active?: boolean;
};

const LIST_QUERY = `
  select s.id, s.email, s.full_name, s.role, s.role_id, r.name as role_name,
         s.is_active, s.avatar_url, s.created_at, s.updated_at
  from staff s
  left join roles r on r.id = s.role_id
`;

export async function listStaff(): Promise<StaffRecord[]> {
  const pool = getPool();
  const res = await pool.query(`${LIST_QUERY} order by s.created_at asc`);
  return res.rows as StaffRecord[];
}

export async function getStaffById(id: string): Promise<StaffRecord | null> {
  const pool = getPool();
  const res = await pool.query(`${LIST_QUERY} where s.id = $1`, [id]);
  return (res.rows[0] as StaffRecord) || null;
}

export async function getStaffByEmail(email: string): Promise<StaffRecord | null> {
  const pool = getPool();
  const res = await pool.query(`${LIST_QUERY} where lower(s.email) = lower($1)`, [email]);
  return (res.rows[0] as StaffRecord) || null;
}

export async function createStaff(input: CreateStaffInput): Promise<StaffRecord> {
  const pool = getPool();
  const passwordHash = input.password ? hashPassword(input.password) : null;
  const res = await pool.query(
    `insert into staff (email, full_name, role, role_id, is_active, password_hash, created_at, updated_at)
     values ($1, $2, $3, $4, true, $5, now(), now())
     returning id`,
    [input.email.trim(), input.full_name.trim(), input.role || "staff", input.role_id || null, passwordHash]
  );
  const created = await getStaffById(res.rows[0].id);
  if (!created) throw new Error("Tạo nhân viên thất bại.");
  return created;
}

export async function updateStaff(id: string, input: UpdateStaffInput): Promise<StaffRecord | null> {
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.email !== undefined) {
    sets.push(`email = $${idx++}`);
    values.push(input.email.trim());
  }
  if (input.full_name !== undefined) {
    sets.push(`full_name = $${idx++}`);
    values.push(input.full_name.trim());
  }
  if (input.role_id !== undefined) {
    sets.push(`role_id = $${idx++}`);
    values.push(input.role_id);
  }
  if (input.role !== undefined) {
    sets.push(`role = $${idx++}`);
    values.push(input.role);
  }
  if (input.is_active !== undefined) {
    sets.push(`is_active = $${idx++}`);
    values.push(input.is_active);
  }
  if (sets.length === 0) return getStaffById(id);

  sets.push(`updated_at = now()`);
  values.push(id);
  await pool.query(`update staff set ${sets.join(", ")} where id = $${idx}`, values);
  return getStaffById(id);
}

export async function deleteStaff(id: string): Promise<void> {
  const pool = getPool();
  await pool.query(`delete from staff where id = $1`, [id]);
}

export async function resetStaffPassword(id: string): Promise<void> {
  const pool = getPool();
  await pool.query(`update staff set password_hash = null, updated_at = now() where id = $1`, [id]);
}
