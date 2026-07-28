import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/permissions";
import { isValidPermissionKey } from "@/lib/permissions/catalog";
import { createRole, listRoles } from "@/lib/roles/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1, "Tên vai trò là bắt buộc."),
  description: z.string().optional().nullable(),
  permission_keys: z.array(z.string().refine(isValidPermissionKey, { message: "permission_key không hợp lệ" }))
});

export async function GET() {
  const guard = await requirePermission("settings.manage_roles");
  if (guard) return guard;
  try {
    const roles = await listRoles();
    return NextResponse.json({ roles });
  } catch (error) {
    console.error("GET /api/settings/roles failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách vai trò." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const guard = await requirePermission("settings.manage_roles");
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
    const role = await createRole(parsed.data);
    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /idx_roles_name_lower|duplicate key/i.test(error.message)) {
      return NextResponse.json({ error: "Tên vai trò đã tồn tại." }, { status: 409 });
    }
    console.error("POST /api/settings/roles failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được vai trò." },
      { status: 500 }
    );
  }
}
