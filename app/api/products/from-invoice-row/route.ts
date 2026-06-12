import { NextResponse } from "next/server";
import { z } from "zod";
import { addInvoiceRowsToInventory } from "@/lib/products/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  rowIds: z.array(z.string()).min(1)
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Danh sách dòng hóa đơn không hợp lệ." }, { status: 400 });
    }

    const result = await addInvoiceRowsToInventory(parsed.data.rowIds);
    const summary = result.result;
    const message =
      summary.syncedRowCount > 0
        ? `Đã đưa ${summary.syncedRowCount} dòng vào sản phẩm/kho. Cộng tồn kho ${summary.totalQuantity}.`
        : "Các dòng này đã được thêm vào sản phẩm/kho trước đó, không cộng tồn kho lại.";

    return NextResponse.json({ ...result, message });
  } catch (error) {
    console.error("Add invoice rows to inventory API failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thêm được dòng hóa đơn vào sản phẩm/kho." },
      { status: 500 }
    );
  }
}
