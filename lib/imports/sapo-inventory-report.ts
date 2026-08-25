import ExcelJS from "exceljs";

/**
 * Parser cho file "Báo cáo tồn kho" xuất từ Sapo (2 dòng header: dòng nhóm
 * cột "Chi nhánh mặc định" / "Tổng hệ thống" rồi dòng tên cột thật "Tồn kho",
 * "Giá trị tồn kho"... lặp lại). Không dùng rowsToObjects (giả định header ở
 * dòng 1) vì file này có vài dòng tiêu đề/metadata phía trên trước khi tới
 * dòng cột thật.
 */

function normalizeHeader(value: string): string {
  return value
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in (value as any)) {
    return String((value as any).text ?? "").trim();
  }
  if (typeof value === "object" && "result" in (value as any)) {
    return String((value as any).result ?? "").trim();
  }
  return String(value).trim();
}

export interface SapoInventoryRow {
  rowNumber: number;
  sku: string;
  productName: string;
  variantName: string;
  unit: string;
  /** Tồn kho lấy từ cột "Tồn kho" NẰM XA NHẤT bên phải trong dòng header
   * (khi có nhiều branch, đây là cột "Tổng hệ thống" = tổng toàn hệ thống). */
  stock: number;
  /** Giá vốn — cột riêng, không lặp lại theo chi nhánh/hệ thống (0 nếu file
   * không có cột này hoặc ô trống). */
  costPrice: number;
}

export interface ParsedSapoInventoryReport {
  rows: SapoInventoryRow[];
  headerRowNumber: number;
}

/**
 * Quét từng dòng tìm dòng header THẬT: phải có cả cột "Mã SKU" VÀ ít nhất 1
 * cột "Tồn kho" trên CÙNG 1 dòng. Dòng nhóm phía trên ("Chi nhánh mặc định",
 * "Tổng hệ thống") cũng lặp lại "Mã SKU" (do merge cell) nhưng không có cột
 * "Tồn kho" riêng nên sẽ bị bỏ qua.
 */
export async function parseSapoInventoryReport(buffer: Buffer): Promise<ParsedSapoInventoryReport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("File Excel không có sheet nào.");

  let headerRowNumber = -1;
  let skuCol = -1;
  let nameCol = -1;
  let variantCol = -1;
  let unitCol = -1;
  let stockCol = -1;
  let costPriceCol = -1;

  sheet.eachRow((row, rowNumber) => {
    if (headerRowNumber !== -1) return;
    let foundSku = -1;
    let foundName = -1;
    let foundVariant = -1;
    let foundUnit = -1;
    let foundCostPrice = -1;
    const foundStockCols: number[] = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const norm = normalizeHeader(cellText(cell.value));
      if (norm === "masku") foundSku = colNumber;
      else if (norm === "tensanpham" && foundName === -1) foundName = colNumber;
      else if (norm === "tenphienban") foundVariant = colNumber;
      else if (norm === "donvitinh") foundUnit = colNumber;
      else if (norm === "tonkho") foundStockCols.push(colNumber);
      else if (norm === "giavon") foundCostPrice = colNumber;
    });
    if (foundSku !== -1 && foundStockCols.length > 0) {
      headerRowNumber = rowNumber;
      skuCol = foundSku;
      nameCol = foundName;
      variantCol = foundVariant;
      unitCol = foundUnit;
      costPriceCol = foundCostPrice;
      // Cột "Tồn kho" xa nhất bên phải = tổng hệ thống (khi có nhiều chi nhánh).
      stockCol = foundStockCols[foundStockCols.length - 1];
    }
  });

  if (headerRowNumber === -1 || skuCol === -1 || stockCol === -1) {
    throw new Error(
      'Không nhận diện được file. File cần có cột "Mã SKU" và cột "Tồn kho" (đúng định dạng báo cáo tồn kho xuất từ hệ thống bán hàng).'
    );
  }

  const rows: SapoInventoryRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const sku = cellText(row.getCell(skuCol).value);
    if (!sku) return;
    const stockRaw = row.getCell(stockCol).value;
    const stockNum = Number(stockRaw);
    const costPriceRaw = costPriceCol !== -1 ? row.getCell(costPriceCol).value : null;
    const costPriceNum = Number(costPriceRaw);
    rows.push({
      rowNumber,
      sku,
      productName: nameCol !== -1 ? cellText(row.getCell(nameCol).value) : "",
      variantName: variantCol !== -1 ? cellText(row.getCell(variantCol).value) : "",
      unit: unitCol !== -1 ? cellText(row.getCell(unitCol).value) : "",
      stock: Number.isFinite(stockNum) ? stockNum : 0,
      costPrice: Number.isFinite(costPriceNum) && costPriceNum > 0 ? costPriceNum : 0
    });
  });

  return { rows, headerRowNumber };
}
