/**
 * POST /api/customers/[id]/reset-password — cần quyền customers.edit.
 * Xoá password_hash của khách hàng → lần đăng ký/đăng nhập kế tiếp với đúng
 * số điện thoại sẽ set mật khẩu mới (xem lib/customers/auth.ts registerCustomer,
 * cùng cơ chế "bootstrap on first login" như staff). Cũng xoá luôn mọi session
 * hiện có để khách bị đăng xuất khỏi mọi thiết bị.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("customers.edit");
  if (guard) return guard;
  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: "Database chưa cấu hình." }, { status: 500 });
  }
  try {
    const { id } = await context.params;
    await ensureDatabase();
    const pool = getPool();
    const res = await pool.query(`update customers set password_hash = null, updated_at = now() where id = $1`, [id]);
    if ((res.rowCount ?? 0) === 0) {
      return NextResponse.json({ error: "Không tìm thấy khách hàng." }, { status: 404 });
    }
    await pool.query(`delete from customer_sessions where customer_id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/customers/[id]/reset-password failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Đặt lại mật khẩu thất bại." },
      { status: 500 }
    );
  }
}
