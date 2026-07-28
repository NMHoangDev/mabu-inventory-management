import { xlsxResponse } from "@/lib/shared/excel-export";
import { buildTemplateWorkbook } from "@/lib/imports/xlsx-helpers";
import { ORDER_IMPORT_TEMPLATE_COLUMNS } from "@/lib/orders/import-fields";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("orders.import");
  if (guard) return guard;
  const buffer = await buildTemplateWorkbook("Don hang", ORDER_IMPORT_TEMPLATE_COLUMNS);
  return xlsxResponse(buffer, "mau-nhap-don-hang.xlsx");
}
