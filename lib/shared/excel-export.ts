import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

export interface ExcelColumnDef {
  key: string;
  header: string;
  width?: number;
  format?: "text" | "number" | "money" | "date" | "datetime";
}

function applyBorders(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FF93A7B0" } },
    left: { style: "thin", color: { argb: "FF93A7B0" } },
    bottom: { style: "thin", color: { argb: "FF93A7B0" } },
    right: { style: "thin", color: { argb: "FF93A7B0" } }
  };
}

function cellValueFor(format: ExcelColumnDef["format"], value: unknown): unknown {
  if (value === null || value === undefined) return "";
  if (format === "date" || format === "datetime") {
    if (value instanceof Date) return value;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed;
  }
  if (format === "number" || format === "money") {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? num : value;
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Có" : "Không";
  return value as string | number | Date;
}

export async function buildWorkbookBuffer(
  sheetName: string,
  columns: ExcelColumnDef[],
  rows: Record<string, unknown>[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "InvoiceFlow Manager";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((column) => ({
    key: column.key,
    header: column.header,
    width: column.width ?? 18
  }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const lastColLetter = sheet.getColumn(columns.length).letter;
  sheet.autoFilter = { from: "A1", to: `${lastColLetter}1` };

  const header = sheet.getRow(1);
  header.height = 34;
  header.eachCell((cell) => {
    cell.font = { name: "Times New Roman", size: 13, bold: true, color: { argb: "FF083B42" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD8EEF0" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    applyBorders(cell);
  });

  for (const row of rows) {
    const rowValues: Record<string, unknown> = {};
    for (const column of columns) {
      rowValues[column.key] = cellValueFor(column.format, row[column.key]);
    }
    sheet.addRow(rowValues);
  }

  sheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const column = columns[columnNumber - 1];
      cell.font = rowNumber === 1 ? cell.font : { name: "Times New Roman", size: 12 };
      if (rowNumber === 1) {
        applyBorders(cell);
        return;
      }
      const format = column?.format;
      cell.alignment = {
        vertical: "middle",
        horizontal: format === "number" || format === "money" ? "right" : "left",
        wrapText: format === "text"
      };
      if (format === "date") cell.numFmt = "dd/mm/yyyy";
      if (format === "datetime") cell.numFmt = "dd/mm/yyyy hh:mm";
      if (format === "money") cell.numFmt = "#,##0";
      if (format === "number") cell.numFmt = "#,##0.####";
      applyBorders(cell);
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function xlsxResponse(buffer: Buffer, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

export function timestampedFilename(prefix: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${prefix}-${stamp}.xlsx`;
}
