import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/permissions";
import { isValidPermissionKey } from "@/lib/permissions/catalog";
import { deleteRole, getRoleById, RoleInUseError, updateRole } from "@/lib/roles/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  permission_keys: z
    .array(z.string().refine(isValidPermissionKey, { message: "permission_key không hợp lệ" }))
    .optional()
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("settings.manage_roles");
  if (guard) return guard;
  try {
    const { id } = await params;
    const role = await getRoleById(id);
    if (!role) return NextResponse.json({ error: "Không tìm thấy vai trò." }, { status: 404 });
    return NextResponse.json(role);
  } catch (error) {
    console.error("GET /api/settings/roles/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được vai trò." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("settings.manage_roles");
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
    const updated = await updateRole(id, parsed.data);
    if (!updated) return NextResponse.json({ error: "Không tìm thấy vai trò." }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && /idx_roles_name_lower|duplicate key/i.test(error.message)) {
      return NextResponse.json({ error: "Tên vai trò đã tồn tại." }, { status: 409 });
    }
    console.error("PATCH /api/settings/roles/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không sửa được vai trò." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("settings.manage_roles");
  if (guard) return guard;
  try {
    const { id } = await params;
    await deleteRole(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RoleInUseError) {
      return NextResponse.json({ error: error.message, staffCount: error.staffCount }, { status: 409 });
    }
    console.error("DELETE /api/settings/roles/[id] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không xoá được vai trò." },
      { status: 500 }
    );
  }
}
