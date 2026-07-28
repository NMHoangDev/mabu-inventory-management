import { getPool } from "@/lib/db/connection";

export type RoleListItem = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  active_staff_count: number;
  inactive_staff_count: number;
  created_at: string;
  updated_at: string;
};

export type RoleDetail = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  permission_keys: string[];
};

export class RoleInUseError extends Error {
  staffCount: number;
  constructor(staffCount: number) {
    super(`Vai trò đang được gán cho ${staffCount} nhân viên, không thể xoá.`);
    this.staffCount = staffCount;
  }
}

export async function listRoles(): Promise<RoleListItem[]> {
  const pool = getPool();
  const res = await pool.query(`
    select
      r.id, r.name, r.description, r.is_system, r.created_at, r.updated_at,
      count(s.id) filter (where s.is_active)::int as active_staff_count,
      count(s.id) filter (where s.is_active = false)::int as inactive_staff_count
    from roles r
    left join staff s on s.role_id = r.id
    group by r.id, r.name, r.description, r.is_system, r.created_at, r.updated_at
    order by r.created_at asc
  `);
  return res.rows as RoleListItem[];
}

export async function getRoleById(id: string): Promise<RoleDetail | null> {
  const pool = getPool();
  const roleRes = await pool.query(
    `select id, name, description, is_system, created_at, updated_at from roles where id = $1`,
    [id]
  );
  const role = roleRes.rows[0];
  if (!role) return null;
  const permRes = await pool.query(`select permission_key from role_permissions where role_id = $1`, [id]);
  return { ...role, permission_keys: permRes.rows.map((r: { permission_key: string }) => r.permission_key) };
}

async function replacePermissions(client: import("pg").PoolClient, roleId: string, permissionKeys: string[]) {
  await client.query(`delete from role_permissions where role_id = $1`, [roleId]);
  if (permissionKeys.length === 0) return;
  const values: string[] = [];
  const params: unknown[] = [roleId];
  permissionKeys.forEach((key, i) => {
    values.push(`($1, $${i + 2})`);
    params.push(key);
  });
  await client.query(
    `insert into role_permissions (role_id, permission_key) values ${values.join(", ")}`,
    params
  );
}

export async function createRole(input: {
  name: string;
  description?: string | null;
  permission_keys: string[];
}): Promise<RoleDetail> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const res = await client.query(
      `insert into roles (name, description) values ($1, $2) returning id`,
      [input.name.trim(), input.description?.trim() || null]
    );
    const roleId = res.rows[0].id as string;
    await replacePermissions(client, roleId, input.permission_keys);
    await client.query("commit");
    const created = await getRoleById(roleId);
    if (!created) throw new Error("Tạo vai trò thất bại.");
    return created;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function updateRole(
  id: string,
  input: { name?: string; description?: string | null; permission_keys?: string[] }
): Promise<RoleDetail | null> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (input.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(input.name.trim());
    }
    if (input.description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(input.description?.trim() || null);
    }
    if (sets.length > 0) {
      sets.push(`updated_at = now()`);
      values.push(id);
      await client.query(`update roles set ${sets.join(", ")} where id = $${idx}`, values);
    }
    if (input.permission_keys !== undefined) {
      await replacePermissions(client, id, input.permission_keys);
    }
    await client.query("commit");
    return getRoleById(id);
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteRole(id: string): Promise<void> {
  const pool = getPool();
  const countRes = await pool.query(`select count(*)::int as cnt from staff where role_id = $1`, [id]);
  const staffCount = countRes.rows[0]?.cnt ?? 0;
  if (staffCount > 0) {
    throw new RoleInUseError(staffCount);
  }
  await pool.query(`delete from roles where id = $1`, [id]);
}
