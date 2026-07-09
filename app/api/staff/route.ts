import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Danh sách nhân viên dùng cho các dropdown "Nhân viên" ở goods-receipts,
// stock-checks, cost-adjustments, purchase-orders — trước đây hardcode
// ["NA", "PHAN VĂN VŨ", "Khác"], không liên quan gì tới nhân viên thật của
// shop. `staff` là bảng thật (dùng cho đăng nhập Zalo bridge), lấy trực tiếp
// qua pg vì các trang này đã dùng pg cho mọi thứ khác.
export async function GET() {
  if (!isDatabaseConfigured) {
    return NextResponse.json({ staff: [] });
  }
  try {
    const pool = getPool();
    const res = await pool.query(
      `select id, full_name, email, role from staff
       where coalesce(is_active, true) = true
       order by full_name asc`
    );
    return NextResponse.json({ staff: res.rows });
  } catch (error) {
    console.error("GET /api/staff failed:", error);
    return NextResponse.json({ staff: [] });
  }
}
