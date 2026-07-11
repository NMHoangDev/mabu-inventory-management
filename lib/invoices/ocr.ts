import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoogleGenAI, createPartFromUri, createUserContent } from "@google/genai";
import { fixMojibakeText, normalizeFinancials, parseNumeric } from "../shared/format";
import { invoiceExtractResultSchema, type InvoiceDocument, type InvoiceExtractResult, type InvoiceRow } from "../shared/schema";
import { persistUploadedBuffer } from "./storage";

const dataDir = process.env.INVOICEFLOW_DATA_DIR ?? (process.env.VERCEL ? path.join(os.tmpdir(), "invoiceflow") : path.join(process.cwd(), "data"));
export const uploadDir = path.join(dataDir, "uploads");

const prompt = `You are an invoice extraction engine for Vietnamese invoices.
Extract data from the uploaded invoice PDF/image.
Return only valid JSON, no markdown.
If a field is not visible, return empty string.
Do not invent internal product codes or retail names.
Extract every item line separately.
Keep Vietnamese text exactly as shown.
Normalize numbers by removing thousand separators when possible.
CRITICAL - Product Name Extraction:
- The "inputProductName" field must contain the FULL product item name exactly as it appears in the invoice line, including any manufacturer/brand/model/dimension/quality tokens (e.g. "NSX:", "MH:", "Model:", "KT:", "Mới 100%"). Do NOT strip or omit anything — copy the entire line verbatim.
Schema:
{
  "invoiceDate": "",
  "supplierName": "",
  "invoiceSymbol": "",
  "invoiceNumber": "",
  "items": [
    {
      "inputProductName": "",
      "unit": "",
      "quantity": "",
      "unitPrice": "",
      "amountBeforeTax": "",
      "vatRate": "",
      "vatAmount": ""
    }
  ],
  "warnings": []
}`;

const geminiModels = (process.env.GEMINI_MODELS ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const maxRetries = Number(process.env.GEMINI_MAX_RETRIES ?? 2);

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function cleanJsonText(text: string | undefined) {
  const raw = (text ?? "").trim();
  if (!raw) return "{}";
  const withoutFence = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  return start >= 0 && end >= start ? withoutFence.slice(start, end + 1) : withoutFence;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

function isRetryableGeminiError(error: unknown) {
  const message = formatError(error).toLowerCase();
  return (
    message.includes("503") ||
    message.includes("unavailable") ||
    message.includes("high demand") ||
    message.includes("high demend") ||
    message.includes("temporarily") ||
    message.includes("429") ||
    message.includes("rate limit")
  );
}

async function generateInvoiceJson(ai: GoogleGenAI, fileUri: string, mimeType: string) {
  let lastError: unknown;

  for (const model of geminiModels) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await ai.models.generateContent({
          model,
          contents: createUserContent([createPartFromUri(fileUri, mimeType), prompt]),
          config: { responseMimeType: "application/json" }
        });
      } catch (error) {
        lastError = error;
        if (!isRetryableGeminiError(error) || attempt === maxRetries) break;
        await sleep(900 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(formatError(lastError));
}

function normalizeExtract(data: unknown): InvoiceExtractResult {
  const parsed = invoiceExtractResultSchema.safeParse(data);
  if (parsed.success) {
    return {
      ...parsed.data,
      warnings: parsed.data.warnings.map(normalizeWarningText).filter(Boolean)
    };
  }
  return {
    invoiceDate: "",
    supplierName: "",
    invoiceSymbol: "",
    invoiceNumber: "",
    items: [],
    warnings: ["Gemini returned JSON that did not match the expected schema."]
  };
}

function normalizeWarningText(value: string) {
  const fixed = fixMojibakeText(String(value ?? "").trim());
  const lower = fixed.toLowerCase();
  if (!fixed) return "";
  if (lower.includes("signature valid") || lower.includes("valid signature")) return "Chữ ký số hợp lệ";
  return fixed;
}

function extensionFor(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  return ext && ext.length <= 8 ? ext : ".bin";
}

function toStoredRows(result: InvoiceExtractResult, document: InvoiceDocument) {
  const now = new Date().toISOString();
  const items = result.items.length > 0 ? result.items : [];

  return items.map((item, index): InvoiceRow => {
    const base = normalizeFinancials({
      id: `${document.id}-${index + 1}`,
      documentId: document.id,
      sourceFileName: document.fileName,
      invoiceDate: result.invoiceDate,
      supplierName: result.supplierName,
      invoiceSymbol: result.invoiceSymbol,
      invoiceNumber: result.invoiceNumber,
      inputProductName: item.inputProductName,
      internalProductCode: "",
      adjustedInvoiceName: "",
      retailName: "",
      unit: item.unit,
      quantity: parseNumeric(item.quantity) ?? item.quantity,
      unitPrice: parseNumeric(item.unitPrice) ?? item.unitPrice,
      amountBeforeTax: parseNumeric(item.amountBeforeTax) ?? item.amountBeforeTax,
      vatRate: parseNumeric(item.vatRate) ?? item.vatRate,
      vatAmount: parseNumeric(item.vatAmount) ?? item.vatAmount,
      totalAfterTax: "",
      unitPriceAfterTax: "",
      note: "",
      productSyncedAt: "",
      syncedProductId: "",
      inventoryAddedQuantity: "",
      purchaseOrderId: "",
      goodsReceiptId: "",
      createdAt: now,
      updatedAt: now
    });
    return base;
  });
}

export async function scanUploadedFile(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const id = createHash("sha256").update(buffer).digest("hex");
  const fileName = fixMojibakeText(file.name);
  const localPath = path.join(uploadDir, `${id}${extensionFor(fileName)}`);
  const now = new Date().toISOString();
  const mimeType = file.type || "application/octet-stream";

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(localPath, buffer);
  const storedPath = await persistUploadedBuffer(`invoices/${id}${extensionFor(fileName)}`, buffer, mimeType, localPath);

  const documentBase = {
    id,
    fileName,
    fileSize: buffer.byteLength,
    mimeType,
    storedPath,
    uploadedAt: now
  };

  try {
    const ai = getGeminiClient();
    const uploaded = await ai.files.upload({
      file: localPath,
      config: { mimeType: documentBase.mimeType, displayName: fileName }
    });
    if (!uploaded.uri) throw new Error("Gemini file upload did not return a file URI.");

    const response = await generateInvoiceJson(ai, uploaded.uri, uploaded.mimeType ?? documentBase.mimeType);
    const result = normalizeExtract(JSON.parse(cleanJsonText(response.text)));
    const document: InvoiceDocument = {
      ...documentBase,
      status: "scanned",
      rowCount: result.items.length,
      originalRowCount: result.items.length,
      deletedRowCount: 0,
      duplicateCount: 0,
      lastDuplicateAt: "",
      appliedToSummary: false,
      appliedAt: "",
      warnings: result.warnings
    };
    const rows = toStoredRows(result, document);
    if (storedPath !== localPath) await fs.unlink(localPath).catch(() => undefined);
    return { document: { ...document, rowCount: rows.length }, rows, skipped: false };
  } catch (error) {
    const message = isRetryableGeminiError(error)
      ? "Gemini đang quá tải hoặc giới hạn tạm thời. Hãy scan lại sau vài phút."
      : formatError(error);
    const document: InvoiceDocument = {
      ...documentBase,
      status: "error",
      rowCount: 0,
      originalRowCount: 0,
      deletedRowCount: 0,
      duplicateCount: 0,
      lastDuplicateAt: "",
      appliedToSummary: false,
      appliedAt: "",
      warnings: [message]
    };
    if (storedPath !== localPath) await fs.unlink(localPath).catch(() => undefined);
    return { document, rows: [], skipped: false };
  }
}

export async function getUploadedFileId(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return createHash("sha256").update(buffer).digest("hex");
}
