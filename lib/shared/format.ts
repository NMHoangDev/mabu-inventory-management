import type { InvoiceRow } from "./schema";

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
