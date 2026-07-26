import { NextResponse } from "next/server";
import { z } from "zod";
import { buildWorkbookBuffer, xlsxResponse, timestampedFilename } from "@/lib/shared/excel-export";
import { PRODUCT_EXPORT_COLUMNS } from "@/lib/products/export-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  rows: z.array(z.record(z.any())).min(1),
  fields: z.array(z.string()).min(1)
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { rows, fields } = parsed.data;
    const columns = fields.map((key) => PRODUCT_EXPORT_COLUMNS[key]).filter(Boolean);
    if (columns.length === 0) {
      return NextResponse.json({ error: "Chưa chọn trường nào để xuất." }, { status: 400 });
    }
    const buffer = await buildWorkbookBuffer("San pham", columns, rows);
    return xlsxResponse(buffer, timestampedFilename("san-pham"));
  } catch (error) {
    console.error("Products export API failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không xuất được file." },
      { status: 500 }
    );
  }
}
