import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";

export type StaffPermissionContext = {
  staffId: string;
  roleId: string | null;
  roleName: string | null;
  permissions: Set<string>;
};

export async function getCurrentStaffPermissions(): Promise<StaffPermissionContext | null> {
  if (!isDatabaseConfigured) return null;
  const staffId = (await cookies()).get("current_staff_id")?.value;
  if (!staffId) return null;

  const pool = getPool();
  const result = await pool.query(
    `select s.id, s.is_active, s.role_id, r.name as role_name,
            coalesce(
              array_agg(rp.permission_key) filter (where rp.permission_key is not null),
              '{}'
            ) as perms
     from staff s
     left join roles r on r.id = s.role_id
     left join role_permissions rp on rp.role_id = s.role_id
     where s.id = $1
     group by s.id, s.is_active, s.role_id, r.name`,
    [staffId]
  );

  const row = result.rows[0];
  if (!row || row.is_active === false) return null;

  return {
    staffId: row.id,
    roleId: row.role_id,
    roleName: row.role_name,
    permissions: new Set<string>(row.perms || [])
  };
}

export async function requirePermission(permissionKey: string): Promise<NextResponse | null> {
  const ctx = await getCurrentStaffPermissions();
  if (!ctx) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  if (!ctx.permissions.has(permissionKey)) {
    return NextResponse.json({ error: "Bạn không có quyền thực hiện hành động này." }, { status: 403 });
  }
  return null;
}

export async function requireAnyPermission(permissionKeys: string[]): Promise<NextResponse | null> {
  const ctx = await getCurrentStaffPermissions();
  if (!ctx) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  const hasAny = permissionKeys.some((key) => ctx.permissions.has(key));
  if (!hasAny) {
    return NextResponse.json({ error: "Bạn không có quyền thực hiện hành động này." }, { status: 403 });
  }
  return null;
}
