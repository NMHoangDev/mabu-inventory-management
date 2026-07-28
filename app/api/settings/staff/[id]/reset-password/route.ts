import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getStaffById, resetStaffPassword } from "@/lib/staff/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("settings.manage_staff");
  if (guard) return guard;
  try {
    const { id } = await params;
    const staff = await getStaffById(id);
    if (!staff) return NextResponse.json({ error: "Không tìm thấy nhân viên." }, { status: 404 });
    await resetStaffPassword(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/settings/staff/[id]/reset-password failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không đặt lại được mật khẩu." },
      { status: 500 }
    );
  }
}
