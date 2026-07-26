import ExcelJS from "exceljs";
import { buildWorkbookBuffer, type ExcelColumnDef } from "@/lib/shared/excel-export";

function normalizeHeader(value: string): string {
  return value
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export async function loadWorkbookSheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("File Excel không có sheet nào.");
  return sheet;
}

/**
 * Map mỗi dòng theo TÊN cột header (đã chuẩn hoá bỏ dấu/khoảng trắng) -> giá trị,
 * không phụ thuộc thứ tự cột trong file. `headerToKey` map header đã chuẩn hoá -> key mong muốn.
 */
export function rowsToObjects(
  sheet: ExcelJS.Worksheet,
  headerToKey: Record<string, string>
): Array<{ rowNumber: number; values: Record<string, string> }> {
  const headerRow = sheet.getRow(1);
  const colIndexToKey = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalizeHeader(String(cell.value ?? ""));
    const key = headerToKey[normalized];
    if (key) colIndexToKey.set(colNumber, key);
  });

  const results: Array<{ rowNumber: number; values: Record<string, string> }> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    let hasAny = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = colIndexToKey.get(colNumber);
      if (!key) return;
      const raw = cell.value;
      const text =
        raw === null || raw === undefined
          ? ""
          : typeof raw === "object" && raw !== null && "text" in (raw as any)
          ? String((raw as any).text ?? "")
          : String(raw);
      if (text.trim()) hasAny = true;
      values[key] = text.trim();
    });
    if (hasAny) results.push({ rowNumber, values });
  });
  return results;
}

export async function buildTemplateWorkbook(sheetName: string, columns: ExcelColumnDef[]): Promise<Buffer> {
  return buildWorkbookBuffer(sheetName, columns, []);
}
