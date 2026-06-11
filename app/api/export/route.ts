import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { normalizeDateForInput, normalizeFinancials, parseNumeric } from "@/lib/shared/format";
import { excelColumns, exportRequestSchema, type ExcelColumnKey, type InvoiceRow } from "@/lib/shared/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function excelDateValue(value: string) {
  const normalized = normalizeDateForInput(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function excelValue(value: number | string) {
  if (value === "") return "";
  return parseNumeric(value) ?? value;
}

function applyBorders(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FF93A7B0" } },
    left: { style: "thin", color: { argb: "FF93A7B0" } },
    bottom: { style: "thin", color: { argb: "FF93A7B0" } },
    right: { style: "thin", color: { argb: "FF93A7B0" } }
  };
}

function toExcelRow(row: InvoiceRow) {
  const sourceRow = normalizeFinancials(row);
  return excelColumns.reduce(
    (result, column) => {
      const key = column.key;
      const value = sourceRow[key];
      result[key] = key === "invoiceDate" ? excelDateValue(String(value ?? "")) : excelValue(value as string | number);
      return result;
    },
    {} as Record<ExcelColumnKey, string | number | Date>
  );
}

function routeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

export async function POST(request: Request) {
  try {
    const parsed = exportRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid rows payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "InvoiceFlow Manager";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Tong hop hoa don");

    sheet.columns = excelColumns.map((column) => ({
      key: column.key,
      header: column.label,
      width: column.width
    }));
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "Q1" };

    const header = sheet.getRow(1);
    header.height = 34;
    header.eachCell((cell) => {
      cell.font = { name: "Times New Roman", size: 13, bold: true, color: { argb: "FF083B42" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD8EEF0" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      applyBorders(cell);
    });

    for (const row of parsed.data.rows) {
      sheet.addRow(toExcelRow(row));
    }

    sheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        cell.font = rowNumber === 1 ? cell.font : { name: "Times New Roman", size: 12 };
        cell.alignment = {
          vertical: "middle",
          horizontal: columnNumber >= 10 && columnNumber <= 16 ? "right" : "left",
          wrapText: [5, 7, 8, 17].includes(columnNumber)
        };
        if (rowNumber > 1 && columnNumber === 1) cell.numFmt = "dd/mm/yyyy";
        if (rowNumber > 1 && [10, 11, 12, 14, 15, 16].includes(columnNumber)) cell.numFmt = "#,##0";
        if (rowNumber > 1 && columnNumber === 13) cell.numFmt = "0";
        applyBorders(cell);
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="tong-hop-hoa-don.xlsx"'
      }
    });
  } catch (error) {
    console.error("Export API failed:", error);
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
