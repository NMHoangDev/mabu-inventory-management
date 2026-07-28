import { xlsxResponse } from "@/lib/shared/excel-export";
import { buildTemplateWorkbook } from "@/lib/imports/xlsx-helpers";
import { PRODUCT_IMPORT_TEMPLATE_COLUMNS } from "@/lib/products/import-fields";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("products.import");
  if (guard) return guard;
  const buffer = await buildTemplateWorkbook("San pham", PRODUCT_IMPORT_TEMPLATE_COLUMNS);
  return xlsxResponse(buffer, "mau-nhap-san-pham.xlsx");
}
