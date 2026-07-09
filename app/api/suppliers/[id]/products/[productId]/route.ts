import { NextResponse } from "next/server";
import { removeProductFromSupplier } from "@/lib/suppliers/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const { id, productId } = await context.params;
    await removeProductFromSupplier(id, productId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không xoá được liên kết sản phẩm." },
      { status: 500 }
    );
  }
}
