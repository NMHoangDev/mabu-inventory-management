import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/permissions";
import { createStaff, listStaff } from "@/lib/staff/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  email: z.string().email("Email không hợp lệ."),
  full_name: z.string().min(1, "Họ tên là bắt buộc."),
  role_id: z.string().uuid().optional().nullable(),
  role: z.enum(["admin", "staff"]).optional(),
  password: z.string().min(4).optional()
});

export async function GET() {
  const guard = await requirePermission("settings.manage_staff");
  if (guard) return guard;
  try {
    const staff = await listStaff();
    return NextResponse.json({ staff });
  } catch (error) {
    console.error("GET /api/settings/staff failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách nhân viên." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const guard = await requirePermission("settings.manage_staff");
  if (guard) return guard;
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const staff = await createStaff(parsed.data);
    return NextResponse.json(staff, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /staff_email_key|duplicate key/i.test(error.message)) {
      return NextResponse.json({ error: "Email đã tồn tại." }, { status: 409 });
    }
    console.error("POST /api/settings/staff failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được nhân viên." },
      { status: 500 }
    );
  }
}
