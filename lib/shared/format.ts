import type { InvoiceRow } from "./schema";

const vndNumberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

/**
 * Định dạng tiền tệ dùng chung toàn app: dấu chấm phân cách hàng nghìn +
 * hậu tố "VND" rõ ràng (trước đây mỗi trang tự định nghĩa formatter riêng,
 * nhiều nơi hiển thị số thô không phân cách hoặc chỉ có "đ").
 */
export function formatCurrencyVND(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `${vndNumberFormatter.format(safe)} VND`;
}

export function cleanInvoiceProductName(value: string): string {
  if (!value) return value;
  // Strip trailing metadata tokens MH/KT/NSX/Model + value đi kèm.
  // Hóa đơn Việt Nam hay ghi cuối dòng: "...MH 25266/24 KT 6.5x11.5 NSX 03/07/2025"
  // hoặc "...MH: ABC KT: 5x5 NSX: 01/01/2024". Cả 2 dạng đều strip hết.
  //
  // Lưu ý: chỉ strip ở CUỐI string. MH/KT/NSX xuất hiện giữa câu (không phải
  // metadata, vd "Sản phẩm MH đặc biệt") → giữ nguyên để không làm hỏng tên.
  //
  // Chiến lược 2-pass:
  //   1) Strip quality descriptors "Mới 100%" / "không hiệu" (trailing) trước
  //   2) Iteratively strip cụm MH/KT/NSX/Model + value (colon hoặc non-colon).
  //
  // Lý do cần 2 pass: nếu cụm "MH 25266, NSX: Yiyi, Mới 100%" thì phải strip
  // "Mới 100%" trước (để NSX: Yiyi trở thành cuối string), rồi NSX: Yiyi,
  // rồi mới đến MH 25266.
  let result = String(value ?? "");

  // Pass 1: strip trailing quality descriptors (có thể đứng một mình hoặc theo sau text)
  for (let i = 0; i < 5; i++) {
    const before = result;
    result = result
      .replace(/,?\s+Mới\s*100\s*%\s*$/gi, "")
      .replace(/,?\s+Mới\s*100%\s*$/gi, "")
      .replace(/,?\s+Mới100\s*%\s*$/gi, "")
      .replace(/,?\s+Mới100%\s*$/gi, "")
      .replace(/^Mới\s*100\s*%\s*$/gi, "")
      .replace(/^Mới\s*100%\s*$/gi, "")
      .replace(/,?\s+không\s*hiệu\.?\s*$/gi, "")
      .replace(/^không\s*hiệu\.?\s*$/gi, "")
      .replace(/\s*,\s*$/g, "")
      .replace(/\s+\.\s*$/, ".")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (result === before) break;
  }

  // Pass 2: iteratively strip MH/KT/NSX/Model metadata tokens ở cuối string.
  //
  // Chỉ match khi value "looks like metadata" — value ngắn (≤ 60 ký tự)
  // AND chứa digits, /, -, *, x, +, . — i.e., look like code/number/dimension
  // identifier. Đây là cách giảm over-strip trên các tên chứa "MH" trong câu
  // (vd "Sản phẩm MH đặc biệt" → giữ nguyên).
  //
  // Ngoài ra KHÔNG match nếu value là cụm từ tiếng Việt dài (≥ 4 words).
  const isCodeLike = (value: string): boolean => {
    const v = String(value ?? "").trim();
    if (!v) return false;
    if (v.length > 60) return false;
    // Chứa digits, /, *, x, +, (code/number/dimension)
    if (/[0-9\/\*\+\(\)\[\]]/.test(v)) return true;
    // Hoặc là uppercase alphanumeric code ngắn (vd "MPTM3ZA/A", "MQD83")
    if (/^[A-Z0-9][A-Z0-9\/\-\.]{2,30}$/i.test(v)) return true;
    return false;
  };

  const endsWithMetadataToken = (s: string): { cut: number } | null => {
    const trimmed = String(s).trim();
    // Try colon form first (most explicit). Colon form is unambiguous —
    // always strip regardless of value content (could be brand/manufacturer
    // text like "NSX: Yiyi Department Store" which is still metadata).
    const colonRegex = /[\s,\.]+(?:MH|KT|NSX|Model)\s*:\s*[^,\n]+$/i;
    const colonMatch = trimmed.match(colonRegex);
    if (colonMatch) {
      return { cut: trimmed.length - colonMatch[0].length };
    }
    // Non-colon form: try each token. Allow optional whitespace between
    // token and value (e.g., "KT0" or "MH25266" or "MH 25266").
    // Require code-like value to avoid stripping legitimate text.
    const tokens = ["MH", "KT", "NSX", "Model"];
    for (const tok of tokens) {
      const pat = new RegExp(`[\\s,\\.]+${tok}\\s*([^,\\n]+)$`, "i");
      const m = trimmed.match(pat);
      if (m) {
        const value = m[1].trim();
        if (isCodeLike(value)) {
          return { cut: trimmed.length - m[0].length };
        }
      }
    }
    return null;
  };

  for (let i = 0; i < 10; i++) {
    const before = result;
    const trimmed = result.trim();
    if (!trimmed) break;
    const match = endsWithMetadataToken(trimmed);
    if (!match) break;

    let cut = match.cut;
    if (cut >= trimmed.length) break;
    // Trim leading whitespace/comma/dot từ vị trí cắt
    while (cut > 0 && /[\s,\.]/.test(trimmed[cut - 1])) cut--;
    result = trimmed.slice(0, cut);
    result = result
      .replace(/\s*,\s*$/g, "")
      .replace(/\s+\.\s*$/, ".")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (result === before) break;
  }

  return result;
}

export function fixMojibakeText(value: string) {
  if (!/[ÃÄÂ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from([...value].map((char) => char.charCodeAt(0) & 0xff));
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return repaired.includes("\uFFFD") ? value : repaired;
  } catch {
    return value;
  }
}

export function normalizeDateForInput(value: number | string | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slash = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (slash) {
    const [, day, month, year] = slash;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return raw;
}

export function parseNumeric(value: number | string | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/,/g, "")
    .replace(/(?<=\d)\.(?=\d{3}(\D|$))/g, "")
    .replace(/%$/, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function normalizeNumberText(value: number | string | undefined) {
  const numeric = parseNumeric(value);
  return numeric === undefined ? String(value ?? "") : String(numeric);
}

function roundCurrencyNumber(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizeFinancials<T extends Pick<InvoiceRow, "quantity" | "unitPrice" | "amountBeforeTax" | "vatRate" | "vatAmount" | "totalAfterTax" | "unitPriceAfterTax">>(
  row: T
) {
  const amount = parseNumeric(row.amountBeforeTax);
  const vat = parseNumeric(row.vatAmount) ?? 0;
  const vatRate = parseNumeric(row.vatRate) ?? 0;
  const unitPrice = parseNumeric(row.unitPrice);
  const quantity = parseNumeric(row.quantity);

  const totalAfterTax = amount !== undefined ? amount + vat : row.totalAfterTax;
  const unitPriceAfterTax =
    amount !== undefined && vat === 0 && vatRate === 0 && unitPrice !== undefined
      ? unitPrice
      : typeof totalAfterTax === "number" && quantity && quantity !== 0
        ? roundCurrencyNumber(totalAfterTax / quantity)
        : row.unitPriceAfterTax;

  return {
    ...row,
    totalAfterTax,
    unitPriceAfterTax
  };
}

export function calculateVatFields<T extends Pick<InvoiceRow, "quantity" | "unitPrice" | "amountBeforeTax" | "vatRate" | "vatAmount" | "totalAfterTax" | "unitPriceAfterTax">>(
  row: T,
  vatRateValue: number | string
) {
  const amount = parseNumeric(row.amountBeforeTax);
  const quantity = parseNumeric(row.quantity);
  const unitPrice = parseNumeric(row.unitPrice);
  const vatRate = parseNumeric(vatRateValue) ?? 0;
  const nextRate = normalizeNumberText(vatRateValue);

  if (amount === undefined) {
    return normalizeFinancials({
      ...row,
      vatRate: nextRate
    });
  }

  const vatAmount = Math.round((amount * vatRate) / 100);
  const totalAfterTax = amount + vatAmount;
  const unitPriceAfterTax =
    vatRate === 0 && unitPrice !== undefined
      ? unitPrice
      : quantity && quantity !== 0
        ? roundCurrencyNumber(totalAfterTax / quantity)
        : row.unitPriceAfterTax;

  return {
    ...row,
    vatRate: nextRate,
    vatAmount,
    totalAfterTax,
    unitPriceAfterTax
  };
}