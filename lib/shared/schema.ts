import { z } from "zod";

export const invoiceItemSchema = z.object({
  inputProductName: z.string().default(""),
  unit: z.string().default(""),
  quantity: z.union([z.number(), z.string()]).default(""),
  unitPrice: z.union([z.number(), z.string()]).default(""),
  amountBeforeTax: z.union([z.number(), z.string()]).default(""),
  vatRate: z.union([z.number(), z.string()]).default(""),
  vatAmount: z.union([z.number(), z.string()]).default("")
});

export const invoiceExtractResultSchema = z.object({
  invoiceDate: z.string().default(""),
  supplierName: z.string().default(""),
  invoiceSymbol: z.string().default(""),
  invoiceNumber: z.string().default(""),
  items: z.array(invoiceItemSchema).default([]),
  warnings: z.array(z.string()).default([])
});

export const invoiceRowSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  sourceFileName: z.string(),
  invoiceDate: z.string().default(""),
  supplierName: z.string().default(""),
  invoiceSymbol: z.string().default(""),
  invoiceNumber: z.string().default(""),
  inputProductName: z.string().default(""),
  internalProductCode: z.string().default(""),
  adjustedInvoiceName: z.string().default(""),
  retailName: z.string().default(""),
  unit: z.string().default(""),
  quantity: z.union([z.number(), z.string()]).default(""),
  unitPrice: z.union([z.number(), z.string()]).default(""),
  amountBeforeTax: z.union([z.number(), z.string()]).default(""),
  vatRate: z.union([z.number(), z.string()]).default(""),
  vatAmount: z.union([z.number(), z.string()]).default(""),
  totalAfterTax: z.union([z.number(), z.string()]).default(""),
  unitPriceAfterTax: z.union([z.number(), z.string()]).default(""),
  note: z.string().default(""),
  productSyncedAt: z.string().default(""),
  syncedProductId: z.string().default(""),
  inventoryAddedQuantity: z.union([z.number(), z.string()]).default(""),
  // Set khi user đã tạo đơn đặt hàng nhập từ dòng scan này.
  // Dùng để highlight row trên /summary (background xanh nhạt nếu đã có GR).
  purchaseOrderId: z.string().default(""),
  goodsReceiptId: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const documentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
  storedPath: z.string(),
  uploadedAt: z.string(),
  status: z.enum(["scanned", "error"]),
  rowCount: z.number(),
  originalRowCount: z.number().default(0),
  deletedRowCount: z.number().default(0),
  duplicateCount: z.number().default(0),
  lastDuplicateAt: z.string().default(""),
  appliedToSummary: z.boolean().default(false),
  appliedAt: z.string().default(""),
  warnings: z.array(z.string()).default([])
});

export const appStoreSchema = z.object({
  documents: z.array(documentSchema).default([]),
  rows: z.array(invoiceRowSchema).default([])
});

export const excelColumns = [
  { key: "invoiceDate", label: "Ngày", width: 16, type: "date" },
  { key: "supplierName", label: "NHÀ CUNG CẤP", width: 24 },
  { key: "invoiceSymbol", label: "KÝ HIỆU", width: 16 },
  { key: "invoiceNumber", label: "SỐ HÓA ĐƠN", width: 16 },
  { key: "inputProductName", label: "Tên Hàng Hóa đầu vào", width: 60 },
  { key: "internalProductCode", label: "MÃ SẢN PHẨM", width: 18, internal: true },
  { key: "adjustedInvoiceName", label: "TÊN CHỈNH LẠI XUẤT HÓA ĐƠN", width: 55, internal: true },
  { key: "retailName", label: "TÊN BÁN LẺ", width: 35, internal: true },
  { key: "unit", label: "ĐƠN VỊ TÍNH", width: 14 },
  { key: "quantity", label: "SỐ LƯỢNG", width: 14, type: "number" },
  { key: "unitPrice", label: "ĐƠN GIÁ", width: 16, type: "number" },
  { key: "amountBeforeTax", label: "THÀNH TIỀN TRƯỚC THUẾ", width: 24, type: "number" },
  { key: "vatRate", label: "% THUẾ", width: 10, type: "number" },
  { key: "vatAmount", label: "GIÁ TRỊ THUẾ", width: 18, type: "number" },
  { key: "totalAfterTax", label: "THÀNH TIỀN SAU THUẾ", width: 24, type: "number" },
  { key: "unitPriceAfterTax", label: "ĐƠN GIÁ SAU THUẾ", width: 20, type: "number" },
  { key: "note", label: "Ghi Chú", width: 22 }
] as const;

export const rowPatchSchema = invoiceRowSchema.partial().omit({
  id: true,
  documentId: true,
  sourceFileName: true,
  createdAt: true,
  updatedAt: true
});

export const exportRequestSchema = z.object({
  rows: z.array(invoiceRowSchema).min(1)
});

export type InvoiceExtractResult = z.infer<typeof invoiceExtractResultSchema>;
export type InvoiceRow = z.infer<typeof invoiceRowSchema>;
export type InvoiceDocument = z.infer<typeof documentSchema>;
export type AppStore = z.infer<typeof appStoreSchema>;
export type ExcelColumnKey = (typeof excelColumns)[number]["key"];
