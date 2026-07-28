import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";
import {
  queryInventoryDetail,
  queryInventoryLedger,
  queryInventoryBelowThreshold,
  queryInventoryAboveThreshold,
  queryInventoryInOut,
  queryInventoryStockCheck
} from "@/lib/reports/inventory-queries";
import {
  getInventoryExportColumns,
  INVENTORY_REPORT_SHEET_NAMES,
  type InventoryExportGroupBy
} from "@/lib/reports/inventory-export-fields";
import { buildWorkbookBuffer, xlsxResponse, timestampedFilename } from "@/lib/shared/excel-export";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_LIMIT = 100000;

const bodySchema = z.object({
  group_by: z.enum(["detail", "ledger", "below_threshold", "above_threshold", "in_out", "stock_check"]),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  fields: z.array(z.string()).min(1)
});

export async function POST(request: Request) {
  const guard = await requirePermission("reports.export_inventory");
  if (guard) return guard;
  try {
    if (!isDatabaseConfigured) {
      return NextResponse.json({ error: "Database chưa được cấu hình." }, { status: 503 });
    }
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { group_by, date_from, date_to, fields } = parsed.data;
    const groupBy = group_by as InventoryExportGroupBy;

    await ensureDatabase();
    const pool = getPool();

    let rows: Record<string, unknown>[];
    switch (groupBy) {
      case "detail":
        rows = (await queryInventoryDetail(pool, EXPORT_LIMIT)) as unknown as Record<string, unknown>[];
        break;
      case "ledger":
        rows = (await queryInventoryLedger(
          pool,
          date_from ?? "",
          date_to ?? "",
          EXPORT_LIMIT
        )) as unknown as Record<string, unknown>[];
        break;
      case "below_threshold":
        rows = (await queryInventoryBelowThreshold(pool, EXPORT_LIMIT)) as unknown as Record<string, unknown>[];
        break;
      case "above_threshold":
        rows = (await queryInventoryAboveThreshold(pool, EXPORT_LIMIT)) as unknown as Record<string, unknown>[];
        break;
      case "in_out":
        rows = (await queryInventoryInOut(pool, date_from ?? "", date_to ?? "", EXPORT_LIMIT))
          .items as unknown as Record<string, unknown>[];
        break;
      case "stock_check":
        rows = (await queryInventoryStockCheck(
          pool,
          date_from ?? "",
          date_to ?? "",
          EXPORT_LIMIT
        )) as unknown as Record<string, unknown>[];
        break;
    }

    const allColumns = getInventoryExportColumns(groupBy);
    const columns = fields.map((key) => allColumns[key]).filter(Boolean);
    if (columns.length === 0) {
      return NextResponse.json({ error: "Chưa chọn trường nào để xuất." }, { status: 400 });
    }

    const buffer = await buildWorkbookBuffer(INVENTORY_REPORT_SHEET_NAMES[groupBy], columns, rows);
    return xlsxResponse(buffer, timestampedFilename(`bao-cao-ton-kho-${groupBy}`));
  } catch (error) {
    console.error("Inventory export API failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không xuất được file." },
      { status: 500 }
    );
  }
}
