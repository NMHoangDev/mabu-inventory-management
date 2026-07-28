import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/permissions";
import { deleteStaff, getStaffById, updateStaff } from "@/lib/staff/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  email: z.string().email().optional(),
  full_name: z.string().min(1).optional(),
  role_id: z.string().uuid().optional().nullable(),
  role: z.enum(["admin", "staff"]).optional(),
  is_active: z.boolean().optional()
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("settings.manage_staff");
  if (guard) return guard;
  try {
    const { id } = await params;
    const staff = await getStaffById(id);
    if (!staff) return NextResponse.json({ error: "Không tìm thấy nhân viên." }, { status: 404 });
    return NextResponse.json(staff);
  } catch (error) {
    console.error("GET /api/settings/staff/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được nhân viên." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("settings.manage_staff");
  if (guard) return guard;
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const updated = await updateStaff(id, parsed.data);
    if (!updated) return NextResponse.json({ error: "Không tìm thấy nhân viên." }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && /staff_email_key|duplicate key/i.test(error.message)) {
      return NextResponse.json({ error: "Email đã tồn tại." }, { status: 409 });
    }
    console.error("PATCH /api/settings/staff/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không sửa được nhân viên." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("settings.manage_staff");
  if (guard) return guard;
  try {
    const { id } = await params;
    await deleteStaff(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/settings/staff/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không xoá được nhân viên." },
      { status: 500 }
    );
  }
}
