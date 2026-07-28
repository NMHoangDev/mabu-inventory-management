import { NextResponse } from "next/server";
import {
  getSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierDebtSummary,
  type UpdateSupplierInput
} from "@/lib/suppliers/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("suppliers.view");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const data = await getSupplier(id);
    if (!data) return NextResponse.json({ error: "Không tìm thấy nhà cung cấp." }, { status: 404 });
    const debt = await getSupplierDebtSummary(data.id);
    return NextResponse.json({ ...data, debt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được nhà cung cấp." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("suppliers.edit");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateSupplierInput;
    const updated = await updateSupplier(id, body);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không cập nhật được nhà cung cấp." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("suppliers.delete");
  if (guard) return guard;
  try {
    const { id } = await context.params;
    await deleteSupplier(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không xóa được nhà cung cấp." },
      { status: 500 }
    );
  }
}
