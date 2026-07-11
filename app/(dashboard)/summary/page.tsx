"use client";

import { useEffect, useMemo, useRef, useState, MouseEvent as ReactMouseEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Filter,
  Image as ImageIcon,
  Loader2,
  PackagePlus,
  RotateCcw,
  Search,
  Trash2,
  X
} from "lucide-react";
import { excelColumns, type ExcelColumnKey, type InvoiceRow, type InvoiceDocument } from "@/lib/shared/schema";
import { calculateVatFields, normalizeDateForInput, normalizeFinancials, normalizeNumberText, parseNumeric } from "@/lib/shared/format";
import { useApp } from "@/invoice-flow-manager-fe/components/providers/AppProvider";
import type { Lookups } from "@/invoice-flow-manager-fe/components/providers/AppProvider";
import ScanReceiptOptionsModal from "@/app/(dashboard)/scan/components/ScanReceiptOptionsModal";

type Filters = {
  file: string;
  supplier: string;
  product: string;
  invoiceNumber: string;
  sku: string;
  dateFrom: string;
  dateTo: string;
};

type SummarySort = {
  key: SummaryColumnKey;
  direction: "asc" | "desc";
} | null;

type SummaryColumnKey = ExcelColumnKey | "__index" | "__file" | "__delete";

const defaultSummaryColumnWidths: Record<SummaryColumnKey, number> = {
  __index: 52,
  __file: 220,
  invoiceDate: 140,
  supplierName: 220,
  invoiceSymbol: 120,
  invoiceNumber: 150,
  inputProductName: 340,
  internalProductCode: 160,
  adjustedInvoiceName: 320,
  retailName: 220,
  unit: 130,
  quantity: 130,
  unitPrice: 150,
  amountBeforeTax: 210,
  vatRate: 118,
  vatAmount: 160,
  totalAfterTax: 210,
  unitPriceAfterTax: 190,
  note: 220,
  __delete: 112
};

const numericKeys = new Set<ExcelColumnKey>([
  "quantity",
  "unitPrice",
  "amountBeforeTax",
  "vatRate",
  "vatAmount",
  "totalAfterTax",
  "unitPriceAfterTax"
]);

const internalKeys = new Set<ExcelColumnKey>(["internalProductCode", "adjustedInvoiceName", "retailName"]);
const vatOptions = ["0", "5", "8", "10"];

function fmtNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function fmtCurrency(value: number) {
  return `${fmtNumber(value)} đ`;
}

function includesText(value: unknown, query: string) {
  return String(value ?? "").toLowerCase().includes(query.trim().toLowerCase());
}

function isDateWithin(date: string, from: string, to: string) {
  const normalized = normalizeDateForInput(date);
  if (from && normalized < from) return false;
  if (to && normalized > to) return false;
  return true;
}

function isNoTaxRow(row: InvoiceRow) {
  const vatRate = parseNumeric(row.vatRate) ?? 0;
  const vatAmount = parseNumeric(row.vatAmount) ?? 0;
  const hasTaxValue = String(row.vatRate ?? "").trim() || String(row.vatAmount ?? "").trim();
  return vatRate === 0 && vatAmount === 0 && Boolean(hasTaxValue || row.totalAfterTax || row.unitPriceAfterTax);
}

function isProductSyncedRow(row: InvoiceRow) {
  return Boolean(String(row.productSyncedAt ?? "").trim());
}

function fileSizeLabel(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function productLookupBySku(products: Lookups["products"], sku: string) {
  const trimmed = sku.trim().toLowerCase();
  if (!trimmed) return null;
  return products.find((p) => String(p.sku ?? "").trim().toLowerCase() === trimmed) ?? null;
}

function productCanonicalName(product: NonNullable<ReturnType<typeof productLookupBySku>>) {
  // Legacy `Lookups.products` (product_catalog) chỉ có retailName/adjustedInvoiceName/
  // inputProductName. Một số nơi vẫn truyền ProductSummary có thêm `name` (từ
  // /api/products/search). Ưu tiên `name` trước để hiển thị đúng tên thật.
  const anyProduct = product as unknown as { name?: string | null };
  return (
    String(anyProduct.name ?? "") ||
    String(product.retailName || product.adjustedInvoiceName || product.inputProductName || "")
  );
}

function documentProgressText(document: InvoiceDocument) {
  const original = document.originalRowCount || document.rowCount;
  if (document.deletedRowCount > 0) return `${document.rowCount}/${original} dòng · đã xóa ${document.deletedRowCount}`;
  return `${document.rowCount} dòng`;
}

export default function SummaryPage() {
  const { store, setStore, lookups, setError, setNotice, confirmAction } = useApp();

  const [filters, setFilters] = useState<Filters>({
    file: "",
    supplier: "",
    product: "",
    invoiceNumber: "",
    sku: "",
    dateFrom: "",
    dateTo: ""
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filePanelOpen, setFilePanelOpen] = useState(false);
  const [summaryColumnWidths, setSummaryColumnWidths] = useState(defaultSummaryColumnWidths);
  const [summarySort, setSummarySort] = useState<SummarySort>(null);
  const [vatDrafts, setVatDrafts] = useState<Record<string, string>>({});
  const [vatConfirm, setVatConfirm] = useState<{
    rowId: string;
    previousRate: string;
    nextRate: string;
    preview: InvoiceRow;
  } | null>(null);
  // Khi user bấm "Tạo đơn đặt hàng nhập" trên 1 dòng → mở modal ScanReceiptOptionsModal
  // cho documentId của dòng đó. Modal có menu 2 options + tạo PO + đơn nhập hàng
  // ở trạng thái "chờ" → cộng tồn kho chỉ khi user hoàn thành đơn nhập hàng.
  const [receiptModalDocumentId, setReceiptModalDocumentId] = useState<string | null>(null);
  // Khi user click vào 1 ô trống (mã SP / tên bán lẻ / tên chỉnh lại xuất hóa đơn
  // / tên hàng hóa / đơn vị) → mở SummaryProductLinkModal cho dòng đó. Modal có
  // menu 2 options: "đã có trong danh sách" (search dropdown) hoặc "chưa có"
  // (điền tay 3 cột còn thiếu, mã SKU tự tạo với prefix "SKU" nếu bỏ trống).
  const [linkModalRowId, setLinkModalRowId] = useState<string | null>(null);

  const appliedDocuments = useMemo(() => store.documents.filter((document) => document.appliedToSummary), [store.documents]);
  const appliedDocumentIds = useMemo(() => new Set(appliedDocuments.map((document) => document.id)), [appliedDocuments]);
  const summaryRows = useMemo(() => store.rows.filter((row) => appliedDocumentIds.has(row.documentId)), [appliedDocumentIds, store.rows]);
  const errorDocuments = store.documents.filter((document) => document.status === "error").length;
  const totalDocuments = appliedDocuments.length;
  const documentById = useMemo(() => new Map(store.documents.map((document) => [document.id, document])), [store.documents]);

  const vatSelectOptions = useMemo(
    () =>
      Array.from(new Set([...vatOptions, ...lookups.vatRates].map((vat) => normalizeNumberText(vat)).filter(Boolean))).sort(
        (first, second) => (parseNumeric(first) ?? 0) - (parseNumeric(second) ?? 0)
      ),
    [lookups.vatRates]
  );

  const filteredRows = useMemo(() => {
    return summaryRows.filter((row) => {
      if (filters.file && !includesText(row.sourceFileName, filters.file)) return false;
      if (filters.supplier && !includesText(row.supplierName, filters.supplier)) return false;
      if (filters.product && !includesText(row.inputProductName, filters.product) && !includesText(row.adjustedInvoiceName, filters.product)) {
        return false;
      }
      if (filters.invoiceNumber && !includesText(row.invoiceNumber, filters.invoiceNumber)) return false;
      if (filters.sku && !includesText(row.internalProductCode, filters.sku)) return false;
      return isDateWithin(row.invoiceDate, filters.dateFrom, filters.dateTo);
    });
  }, [filters, summaryRows]);

  const displayedRows = useMemo(() => {
    if (!summarySort || summarySort.key === "__delete" || summarySort.key === "__index") return filteredRows;

    const valueForSort = (row: InvoiceRow) => {
      if (summarySort.key === "__file") return row.sourceFileName;
      return row[summarySort.key as ExcelColumnKey] ?? "";
    };

    return [...filteredRows].sort((first, second) => {
      const firstValue = valueForSort(first);
      const secondValue = valueForSort(second);
      const firstNumber = parseNumeric(firstValue as number | string);
      const secondNumber = parseNumeric(secondValue as number | string);
      const multiplier = summarySort.direction === "asc" ? 1 : -1;

      if (summarySort.key === "invoiceDate") {
        return normalizeDateForInput(firstValue as string).localeCompare(normalizeDateForInput(secondValue as string)) * multiplier;
      }

      if (firstNumber !== undefined && secondNumber !== undefined) {
        return (firstNumber - secondNumber) * multiplier;
      }

      return String(firstValue ?? "").localeCompare(String(secondValue ?? ""), "vi", { numeric: true, sensitivity: "base" }) * multiplier;
    });
  }, [filteredRows, summarySort]);

  const visibleDocuments = useMemo(() => {
    const rowCountByDocument = new Map<string, number>();
    for (const row of displayedRows) rowCountByDocument.set(row.documentId, (rowCountByDocument.get(row.documentId) ?? 0) + 1);

    return Array.from(rowCountByDocument.entries())
      .map(([documentId, rowCount]) => {
        const document = documentById.get(documentId);
        return document ? { document, rowCount } : null;
      })
      .filter((item): item is { document: InvoiceDocument; rowCount: number } => Boolean(item))
      .sort((first, second) => new Date(second.document.uploadedAt).getTime() - new Date(first.document.uploadedAt).getTime());
  }, [displayedRows, documentById]);

  const summaryTableWidth = useMemo(
    () => Object.values(summaryColumnWidths).reduce((total, width) => total + width, 0),
    [summaryColumnWidths]
  );

  const exportExcel = async () => {
    if (displayedRows.length === 0) return;

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: displayedRows })
      });
      if (!response.ok) throw new Error("Không xuất được Excel.");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tong-hop-hoa-don.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xuất được Excel.");
    }
  };

  const saveRowPatch = async (rowId: string, patch: Partial<InvoiceRow>) => {
    try {
      const response = await fetch(`/api/rows/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(response.ok ? "API không trả JSON hợp lệ." : `API lỗi ${response.status}.`);
      }
      if (!response.ok) throw new Error(data.error ?? "Không lưu được dòng.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không lưu được dòng.");
    }
  };

  const commitRowPatch = (rowId: string, patch: Partial<InvoiceRow>) => {
    setStore((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === rowId ? normalizeFinancials({ ...row, ...patch }) : row))
    }));
    void saveRowPatch(rowId, patch);
  };

  const deleteRow = async (rowId: string) => {
    const row = store.rows.find((item) => item.id === rowId);
    const confirmed = await confirmAction({
      title: "Xóa dòng scan nhầm?",
      description: "Tài liệu sẽ ghi nhận dòng đã bị xóa thủ công. Upload lại đúng file này nếu cần khôi phục dòng đã xóa.",
      confirmLabel: "Xóa dòng",
      tone: "danger"
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/rows/${rowId}`, { method: "DELETE" });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(response.ok ? "API không trả JSON hợp lệ." : `API lỗi ${response.status}.`);
      }
      if (!response.ok) throw new Error(data.error ?? "Không xóa được dòng.");
      setStore(data);
      setNotice(row ? `Đã xóa 1 dòng thuộc file ${row.sourceFileName}. Upload lại file này nếu cần khôi phục dòng đã xóa.` : "Đã xóa dòng.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xóa được dòng.");
    }
  };

  const deleteDocument = async (documentId: string) => {
    const document = store.documents.find((item) => item.id === documentId);
    const activeRows = store.rows.filter((row) => row.documentId === documentId).length;
    const deletedRows = document?.deletedRowCount ?? 0;
    const fileName = document?.fileName ?? "tài liệu này";
    const confirmMessage = [
      `Xóa file "${fileName}"?`,
      `Toàn bộ ${activeRows} dòng đang có trong bảng tổng hợp sẽ bị xóa theo file này.`,
      deletedRows ? `File này trước đó đã xóa thủ công ${deletedRows} dòng.` : "",
      "Hành động này chỉ nên dùng khi scan nhầm hoặc không cần giữ file."
    ].filter(Boolean).join("\n");
    
    const confirmed = await confirmAction({
      title: `Xóa file "${fileName}"?`,
      description: confirmMessage.replace(`Xóa file "${fileName}"?\n`, ""),
      confirmLabel: "Xóa file",
      tone: "danger"
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(response.ok ? "API không trả JSON hợp lệ." : `API lỗi ${response.status}.`);
      }
      if (!response.ok) throw new Error(data.error ?? "Không xóa được tài liệu.");
      setStore(data);
      setNotice(document ? `Đã xóa tài liệu ${document.fileName} và các dòng thuộc file.` : "Đã xóa tài liệu.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xóa được tài liệu.");
    }
  };

  const cleanText = (value: unknown) => String(value ?? "").trim();

  const requestVatRateChange = (row: InvoiceRow, nextRateValue: string) => {
    if (vatConfirm) return;
    const nextRate = normalizeNumberText(nextRateValue);
    if (nextRate === normalizeNumberText(row.vatRate)) return;

    setVatConfirm({
      rowId: row.id,
      previousRate: String(row.vatRate ?? ""),
      nextRate,
      preview: calculateVatFields(row, nextRate)
    });
  };

  const cancelVatRateChange = () => {
    if (vatConfirm) {
      setVatDrafts((current) => {
        const next = { ...current };
        delete next[vatConfirm.rowId];
        return next;
      });
    }
    setVatConfirm(null);
  };

  const applyVatRateChange = async () => {
    if (!vatConfirm) return;

    const nextRow = vatConfirm.preview;
    setVatConfirm(null);
    setStore((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === nextRow.id ? nextRow : row))
    }));
    setNotice(
      `Đã cập nhật % thuế ${vatConfirm.nextRate || "0"} và tính lại giá trị thuế, thành tiền sau thuế, đơn giá sau thuế.`
    );
    setVatDrafts((current) => {
      const next = { ...current };
      delete next[nextRow.id];
      return next;
    });
    await saveRowPatch(nextRow.id, {
      vatRate: nextRow.vatRate,
      vatAmount: nextRow.vatAmount,
      totalAfterTax: nextRow.totalAfterTax,
      unitPriceAfterTax: nextRow.unitPriceAfterTax
    });
  };

  const minWidthForSummaryColumn = (key: SummaryColumnKey) => {
    if (key === "__index") return 44;
    if (key === "__delete") return 92;
    if (key === "__file") return 150;
    if (key === "inputProductName" || key === "adjustedInvoiceName") return 190;
    if (key === "supplierName" || key === "retailName" || key === "note") return 160;
    if (numericKeys.has(key)) return 110;
    return 96;
  };

  const startColumnResize = (key: SummaryColumnKey, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = summaryColumnWidths[key];
    const minWidth = minWidthForSummaryColumn(key);

    const onMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(minWidth, Math.round(startWidth + moveEvent.clientX - startX));
      setSummaryColumnWidths((current) => ({ ...current, [key]: nextWidth }));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const toggleSummarySort = (key: SummaryColumnKey) => {
    if (key === "__delete" || key === "__index") return;
    setSummarySort((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  };

  const editableCells = new Set<ExcelColumnKey>([
    "internalProductCode",
    "retailName",
    "adjustedInvoiceName",
    "inputProductName",
    "unit"
  ]);
  const tryOpenLinkModal = (row: InvoiceRow, key: ExcelColumnKey) => {
    if (!editableCells.has(key)) return;
    const value = row[key];
    // Chỉ mở modal khi ô đang TRỐNG. Nếu đã có giá trị → user click để sửa trực tiếp.
    if (String(value ?? "").trim()) return;
    setLinkModalRowId(row.id);
  };

  const renderCell = (row: InvoiceRow, key: ExcelColumnKey) => {
    const value = row[key] ?? "";
    const shouldHighlightManualField = internalKeys.has(key) && !cleanText(value);
    const className = `table-field ${shouldHighlightManualField ? "manual-field" : ""} ${
      numericKeys.has(key) ? "text-right tabular-nums" : ""
    }`;

    // Ô "trống" của các cột có thể gắn SP → bọc trong 1 clickable overlay mở modal.
    // Khi user click vào input thì focus vào input để gõ; click vào overlay thì mở modal.
    const empty = !cleanText(value);
    const showOverlay = empty && editableCells.has(key);

    if (key === "invoiceDate") {
      const currentValue = normalizeDateForInput(value);
      return (
        <input
          key={`${row.id}-${key}-${currentValue}`}
          className={className}
          type="date"
          defaultValue={currentValue}
          onBlur={(event) => {
            const nextValue = event.currentTarget.value;
            if (nextValue !== currentValue) commitRowPatch(row.id, { invoiceDate: nextValue });
          }}
        />
      );
    }

    if (key === "internalProductCode") {
      const currentValue = String(value);
      const matched = productLookupBySku(lookups.products, currentValue);
      return (
        <div className="relative h-full w-full">
          <input
            key={`${row.id}-${key}-${currentValue}`}
            className={
              matched
                ? `${className} sku-matched`
                : showOverlay
                  ? `${className} cursor-pointer border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10`
                  : className
            }
            defaultValue={currentValue}
            placeholder={showOverlay ? "Bấm vào đây để chọn / tạo sản phẩm…" : "Mã SKU"}
            readOnly={showOverlay}
            onClick={() => {
              if (showOverlay) tryOpenLinkModal(row, key);
            }}
            onBlur={(event) => {
              const nextValue = event.currentTarget.value.trim();
              if (nextValue === currentValue) return;
              const product = productLookupBySku(lookups.products, nextValue);
              const patch: Partial<InvoiceRow> = { internalProductCode: nextValue };
              if (product) {
                const canonical = productCanonicalName(product);
                if (canonical) {
                  patch.adjustedInvoiceName = canonical;
                  patch.retailName = canonical;
                }
              }
              commitRowPatch(row.id, patch);
            }}
          />
        </div>
      );
    }

    if (key === "unit") {
      const currentValue = String(value);
      return (
        <div className="relative h-full w-full">
          <input
            key={`${row.id}-${key}-${currentValue}`}
            className={
              showOverlay
                ? `${className} cursor-pointer border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10`
                : className
            }
            defaultValue={currentValue}
            placeholder={showOverlay ? "Bấm vào đây để chọn / tạo sản phẩm…" : "Đơn vị"}
            readOnly={showOverlay}
            onClick={() => {
              if (showOverlay) tryOpenLinkModal(row, key);
            }}
            onBlur={(event) => {
              const nextValue = event.currentTarget.value;
              if (nextValue !== currentValue) commitRowPatch(row.id, { unit: nextValue });
            }}
          />
        </div>
      );
    }

    if (key === "vatRate") {
      const currentVatRate = normalizeNumberText(value);
      const draftVatRate = vatDrafts[row.id] ?? currentVatRate;

      const requestDraftVatRateChange = (nextValue: string) => {
        const nextRate = normalizeNumberText(nextValue);
        setVatDrafts((current) => {
          const next = { ...current };
          if (nextRate === currentVatRate) delete next[row.id];
          else next[row.id] = nextRate;
          return next;
        });
        if (nextRate !== currentVatRate) requestVatRateChange(row, nextRate);
      };

      return (
        <div className="vat-combo">
          <input
            className={`${className} vat-input`}
            inputMode="decimal"
            value={draftVatRate}
            placeholder="0"
            onChange={(event) => setVatDrafts((current) => ({ ...current, [row.id]: event.target.value.replace(/[^\d.,-]/g, "") }))}
            onBlur={(event) => requestDraftVatRateChange(event.target.value)}
            title="Nhập % thuế. Gõ 0 nếu hóa đơn không có thuế."
          />
          <select
            className="vat-preset"
            value=""
            onChange={(event) => {
              requestDraftVatRateChange(event.target.value);
              event.currentTarget.value = "";
            }}
            title="Chọn nhanh % thuế"
          >
            <option value="" disabled hidden></option>
            {vatSelectOptions.map((vat) => (
              <option key={vat} value={vat}>
                {vat}%
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (numericKeys.has(key)) {
      const currentValue = String(value);
      return (
        <input
          key={`${row.id}-${key}-${currentValue}`}
          className={className}
          inputMode="decimal"
          defaultValue={currentValue}
          onChange={(event) => {
            event.currentTarget.value = event.currentTarget.value.replace(/[^\d.,-]/g, "");
          }}
          onBlur={(event) => {
            const nextValue = normalizeNumberText(event.target.value);
            if (nextValue === currentValue) return;
            const nextRow = normalizeFinancials({ ...row, [key]: nextValue });
            commitRowPatch(row.id, { [key]: nextRow[key] } as Partial<InvoiceRow>);
          }}
        />
      );
    }

    const currentValue = String(value);
    const isTextEditable = key === "retailName" || key === "adjustedInvoiceName" || key === "inputProductName";
    return (
      <div className="relative h-full w-full">
        <input
          key={`${row.id}-${key}-${currentValue}`}
          className={
            showOverlay
              ? `${className} cursor-pointer border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10`
              : className
          }
          defaultValue={currentValue}
          title={currentValue}
          placeholder={showOverlay ? "Bấm vào đây để chọn / tạo sản phẩm…" : (isTextEditable ? "Tên sản phẩm" : "")}
          readOnly={showOverlay}
          onClick={() => {
            if (showOverlay) tryOpenLinkModal(row, key);
          }}
          onBlur={(event) => {
            const nextValue = event.currentTarget.value;
            if (nextValue !== currentValue) commitRowPatch(row.id, { [key]: nextValue } as Partial<InvoiceRow>);
          }}
        />
      </div>
    );
  };

  const renderSummaryHeader = (key: SummaryColumnKey, label: string, className = "") => {
    const isSortable = key !== "__delete" && key !== "__index";
    const activeSort = summarySort?.key === key ? summarySort.direction : "";
    const SortIcon = activeSort === "asc" ? ArrowUp : activeSort === "desc" ? ArrowDown : ArrowUpDown;

    return (
      <th
        key={key}
        className={`resizable-th border-b border-r border-slate-200 px-3 py-2.5 text-left ${isSortable ? "cursor-pointer select-none hover:bg-slate-100" : ""} ${className}`}
        style={{ width: summaryColumnWidths[key] }}
        title={label}
        onClick={() => {
          if (isSortable) toggleSummarySort(key);
        }}
        onKeyDown={(event) => {
          if (!isSortable || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          toggleSummarySort(key);
        }}
        tabIndex={isSortable ? 0 : undefined}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{label}</span>
          {isSortable ? <span className={`summary-sort-button ${activeSort ? "text-primary" : "text-slate-400"}`}>
              <SortIcon className="h-3.5 w-3.5" />
            </span> : null}
        </div>
        <button
          type="button"
          className="column-resize-handle"
          aria-label={`Kéo chỉnh độ rộng cột ${label}`}
          onMouseDown={(event) => startColumnResize(key, event)}
        />
      </th>
    );
  };

  return (
    <>
      <section className="space-y-3">
        <div className="panel overflow-hidden px-3 py-2.5">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors ${
                  filtersOpen
                    ? "border-primary bg-primary text-white shadow-sm hover:bg-primary/95"
                    : "border-primary/20 bg-primary/5 text-slate-900 hover:bg-primary/10"
                }`}
                onClick={() => setFiltersOpen((value) => !value)}
                aria-expanded={filtersOpen}
                aria-controls="summary-filter-tray"
                title={filtersOpen ? "Ẩn bộ lọc" : "Hiện bộ lọc"}
              >
                <Filter className={`h-4 w-4 ${filtersOpen ? "text-white" : "text-primary"}`} />
                Bộ lọc tổng hợp
                {filtersOpen ? <ChevronUp className="h-4 w-4 text-white" /> : <ChevronDown className="h-4 w-4 text-primary" />}
              </button>
              {[
                ["Tài liệu", totalDocuments],
                ["Dòng", summaryRows.length],
                ["Đang lọc", filteredRows.length],
                ["Lỗi OCR", errorDocuments]
              ].map(([label, value]) => (
                <div key={String(label)} className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-secondary/60 px-2.5 text-xs text-muted-foreground">
                  <span>{label}</span>
                  <span className="font-semibold text-foreground tabular-nums">{fmtNumber(Number(value))}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-md border bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-secondary disabled:opacity-50"
                onClick={() => setFilePanelOpen(true)}
                disabled={displayedRows.length === 0}
              >
                <FileText className="h-4 w-4" />
                File trong bảng
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                onClick={exportExcel}
                disabled={displayedRows.length === 0}
              >
                <Download className="h-4 w-4" />
                Xuất Excel
              </button>
            </div>
          </div>
          <div id="summary-filter-tray" className="filter-tray -mx-3 mt-2" data-open={filtersOpen ? "true" : "false"}>
            <div>
              <div className="grid gap-2 bg-slate-50/80 px-3 py-3 md:grid-cols-3 xl:grid-cols-7">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Nhà cung cấp</span>
                  <input className="field h-9 py-1.5" value={filters.supplier} onChange={(event) => setFilters({ ...filters, supplier: event.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Tên sản phẩm</span>
                  <input className="field h-9 py-1.5" value={filters.product} onChange={(event) => setFilters({ ...filters, product: event.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">SKU / mã sản phẩm</span>
                  <input className="field h-9 py-1.5" value={filters.sku} onChange={(event) => setFilters({ ...filters, sku: event.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Số hóa đơn</span>
                  <input className="field h-9 py-1.5" value={filters.invoiceNumber} onChange={(event) => setFilters({ ...filters, invoiceNumber: event.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Từ ngày</span>
                  <input className="field h-9 py-1.5" type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Đến ngày</span>
                  <input className="field h-9 py-1.5" type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="h-9 w-full rounded-md border bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-secondary"
                    onClick={() => {
                      setFilters({ file: "", supplier: "", product: "", invoiceNumber: "", sku: "", dateFrom: "", dateTo: "" });
                      setSummarySort(null);
                    }}
                  >
                    Xóa lọc
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <Search className="h-4 w-4 text-primary" />
              Tổng hợp hóa đơn đã scan
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Tự lưu nền khi rời ô</span>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 font-medium text-slate-600 hover:bg-secondary"
                onClick={() => setSummaryColumnWidths(defaultSummaryColumnWidths)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset cột
              </button>
            </div>
          </div>
          <div className="summary-table-scroll max-h-[calc(100vh-250px)] overflow-auto">
            <table
              className="data-table invoice-grid border-collapse text-sm"
              style={{ width: summaryTableWidth, minWidth: summaryTableWidth }}
            >
              <colgroup>
                <col style={{ width: summaryColumnWidths.__index }} />
                <col style={{ width: summaryColumnWidths.__file }} />
                {excelColumns.map((column) => (
                  <col key={column.key} style={{ width: summaryColumnWidths[column.key] }} />
                ))}
                <col style={{ width: summaryColumnWidths.__delete }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-accent text-accent-foreground">
                <tr>
                  {renderSummaryHeader("__index", "#")}
                  {renderSummaryHeader("__file", "File")}
                  {excelColumns.map((column) => (
                    renderSummaryHeader(column.key, column.label)
                  ))}
                  {renderSummaryHeader("__delete", "Thao tác", "border-r-0 text-center")}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((row, index) => {
                  const document = documentById.get(row.documentId);
                  const hasGoodsReceipt = !!row.goodsReceiptId;
                  const hasPurchaseOrder = !!row.purchaseOrderId;
                  // Ưu tiên: GR > PO > bình thường
                  const rowClassName = isNoTaxRow(row)
                    ? hasGoodsReceipt
                      ? "no-tax-row bg-emerald-50/70 hover:bg-emerald-50"
                      : hasPurchaseOrder
                        ? "no-tax-row bg-blue-50/70 hover:bg-blue-50"
                        : "no-tax-row"
                    : hasGoodsReceipt
                      ? "bg-emerald-50/70 hover:bg-emerald-50"
                      : hasPurchaseOrder
                        ? "bg-blue-50/70 hover:bg-blue-50"
                        : "odd:bg-white even:bg-slate-50/40";

                  return (
                  <tr key={row.id} className={`${rowClassName} hover:bg-accent/40`}>
                    <td className="border-b border-r border-slate-200 px-3 py-2 text-slate-500">{index + 1}</td>
                    <td className="border-b border-r border-slate-200 px-3 py-2 text-xs text-slate-500">
                      <div className="min-w-0">
                        <div className="truncate" title={row.sourceFileName}>
                          {row.sourceFileName}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {hasGoodsReceipt ? (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                              title={`Đã tạo đơn nhập hàng${row.goodsReceiptId ? ` (${row.goodsReceiptId.slice(0, 8)}…)` : ""}`}
                            >
                              ✓ Đã tạo đơn nhập hàng
                            </span>
                          ) : hasPurchaseOrder ? (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
                              title={`Đã tạo đơn đặt hàng nhập (${row.purchaseOrderId.slice(0, 8)}…)`}
                            >
                              ↻ Đơn đặt hàng chờ
                            </span>
                          ) : null}
                          {document?.deletedRowCount ? (
                            <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              Đã xóa {document.deletedRowCount} dòng
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    {excelColumns.map((column) => (
                      <td key={column.key} className="border-b border-r border-slate-200 p-1">
                        {renderCell(row, column.key)}
                      </td>
                    ))}
                    <td className="border-b border-slate-200 px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!row.documentId}
                          onClick={() => setReceiptModalDocumentId(row.documentId)}
                          title="Tạo đơn đặt hàng nhập + đơn nhập hàng từ dòng scan. Tồn kho chỉ cộng khi đơn nhập hàng hoàn thành."
                        >
                          <PackagePlus className="h-4 w-4" />
                          Tạo đơn nhập
                        </button>
                        <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => deleteRow(row.id)} title="Xóa dòng scan nhầm">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={excelColumns.length + 3} className="px-4 py-12 text-center text-slate-500">
                      Chưa có dòng phù hợp bộ lọc.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {vatConfirm ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/35 px-4">
          <div className="w-[min(420px,calc(100vw-2rem))] rounded-lg border border-blue-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="font-semibold text-slate-950">Xác nhận cập nhật thuế</div>
              <div className="mt-1 text-xs text-slate-500">
                Đổi từ {vatConfirm.previousRate ? `${normalizeNumberText(vatConfirm.previousRate)}%` : "trống"} sang {vatConfirm.nextRate || "0"}%.
              </div>
            </div>
            <div className="space-y-2 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Giá trị thuế</span>
                <span className="font-semibold tabular-nums">{fmtCurrency(parseNumeric(vatConfirm.preview.vatAmount) ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Thành tiền sau thuế</span>
                <span className="font-semibold tabular-nums">{fmtCurrency(parseNumeric(vatConfirm.preview.totalAfterTax) ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Đơn giá sau thuế</span>
                <span className="font-semibold tabular-nums">{fmtNumber(parseNumeric(vatConfirm.preview.unitPriceAfterTax) ?? 0)}</span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={cancelVatRateChange}
              >
                Hủy
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-white hover:opacity-90"
                onClick={applyVatRateChange}
              >
                Cập nhật tiền thuế
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {filePanelOpen ? (
        <div className="fixed inset-0 z-[85] flex justify-end bg-slate-950/35">
          <button className="absolute inset-0" aria-label="Đóng danh sách file" onClick={() => setFilePanelOpen(false)} />
          <div className="relative z-10 flex h-full w-[min(560px,100vw)] flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-base font-semibold text-slate-950">File trong bảng</div>
                <div className="mt-1 text-sm text-slate-500">
                  {visibleDocuments.length} file · {fmtNumber(displayedRows.length)} dòng đang hiển thị
                </div>
              </div>
              <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setFilePanelOpen(false)} aria-label="Đóng">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {visibleDocuments.map(({ document, rowCount }) => (
                <div key={document.id} className="border-b border-slate-200 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold" title={document.fileName}>{document.fileName}</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {fileSizeLabel(document.fileSize)} · {rowCount} dòng đang hiển thị · {documentProgressText(document)}
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-400">{document.id.slice(0, 10)}</div>
                      {document.deletedRowCount > 0 ? (
                        <div className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          Đã xóa thủ công {document.deletedRowCount} dòng
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                      onClick={() => deleteDocument(document.id)}
                    >
                      Xóa file
                    </button>
                  </div>
                </div>
              ))}
              {visibleDocuments.length === 0 ? (
                <div className="px-5 py-12 text-center text-slate-500">Không có file nào trong bảng hiện tại.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {receiptModalDocumentId ? (
        <ScanReceiptOptionsModal
          documentId={receiptModalDocumentId}
          onClose={() => setReceiptModalDocumentId(null)}
        />
      ) : null}

      {linkModalRowId ? (() => {
        const linkRow = store.rows.find((item) => item.id === linkModalRowId);
        if (!linkRow) return null;
        return (
          <SummaryProductLinkModal
            row={linkRow}
            products={lookups.products}
            onClose={() => setLinkModalRowId(null)}
            onApply={async (patch) => {
              // Merge patch vào store + gọi PATCH /api/rows/:id.
              // Trả về true/false để modal biết có close hay không.
              try {
                setStore((current) => ({
                  ...current,
                  rows: current.rows.map((row) =>
                    row.id === linkRow.id ? normalizeFinancials({ ...row, ...patch }) : row
                  )
                }));
                const res = await fetch(`/api/rows/${linkRow.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(patch)
                });
                const text = await res.text();
                let data: { error?: string; success?: boolean } = {};
                try { data = JSON.parse(text); } catch {
                  throw new Error(res.ok ? "API không trả JSON hợp lệ." : `API lỗi ${res.status}.`);
                }
                if (!res.ok) throw new Error(data.error ?? "Không lưu được dòng.");
                setLinkModalRowId(null);
                return true;
              } catch (e) {
                setError(e instanceof Error ? e.message : "Không lưu được dòng.");
                return false;
              }
            }}
          />
        );
      })() : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SummaryProductLinkModal — mở khi user click vào 1 ô trống trong hàng tổng
// hợp (mã SKU / tên SP / tên bán lẻ / tên chỉnh lại / đơn vị).
//
// Có 2 lựa chọn:
//   1. "Đã có sản phẩm này trong danh sách sản phẩm"
//      → Search dropdown tìm theo tên/SKU. Có input search. Khi chọn 1 SP
//        sẽ auto-fill: internalProductCode = SKU, inputProductName =
//        tên hóa đơn, adjustedInvoiceName = tên chỉnh lại, retailName = tên
//        bán lẻ, unit = đơn vị. SKU prefix "SKU" nếu SP không có SKU.
//        Nếu SP không có field legacy (retailName/adjustedInvoiceName) thì
//        fallback về `name` chung để 2 cột tên bán lẻ + tên chỉnh lại không
//        bị trống.
//   2. "Sản phẩm này chưa có trong danh sách sản phẩm"
//      → Form cho điền 3 cột: tên SP, mã SKU (tự tạo "SKU<random>" nếu để
//        trống, có chữ "SKU"), đơn vị. Apply thì PATCH row + auto-fill cả 3
//        cột tên (inputProductName, retailName, adjustedInvoiceName) bằng tên
//        user vừa nhập. Nếu retailName/adjustedInvoiceName đã có giá trị thì
//        giữ nguyên.
// ─────────────────────────────────────────────────────────────────────────────

interface ProductSummary {
  id: string;
  sku?: string | null;
  name?: string | null;
  retailName?: string | null;
  adjustedInvoiceName?: string | null;
  inputProductName?: string | null;
  unit?: string | null;
  stock?: number | null;
}

interface SummaryProductLinkModalProps {
  row: InvoiceRow;
  products: Lookups["products"];
  onClose: () => void;
  onApply: (patch: Partial<InvoiceRow>) => Promise<boolean>;
}

function SummaryProductLinkModal({
  row,
  products,
  onClose,
  onApply
}: SummaryProductLinkModalProps) {
  const [menuOpen, setMenuOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [remoteResults, setRemoteResults] = useState<ProductSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manualForm, setManualForm] = useState({
    name: cleanInvoice(row.inputProductName),
    sku: cleanInvoice(row.internalProductCode),
    unit: cleanInvoice(row.unit),
    price: "",
    // Prefill giá vốn từ đơn giá trên hóa đơn (sau thuế nếu có) — user vẫn
    // sửa được, chỉ là gợi ý hợp lý thay vì để trống.
    costPrice: cleanInvoice(row.unitPriceAfterTax) || cleanInvoice(row.unitPrice)
  });
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  async function handleImagePick(file: File) {
    setUploadingImage(true);
    setManualError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads/products", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Không tải lên được ảnh.");
      setManualImageUrl(data.url);
    } catch (e) {
      setManualError(e instanceof Error ? e.message : "Không tải lên được ảnh.");
    } finally {
      setUploadingImage(false);
    }
  }
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cleanInvoice(v: unknown): string {
    return String(v ?? "").trim();
  }

  // Click outside: nếu đang mở menu → đóng menu (mở picker/manual nếu cần).
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuOpen && menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (pickerOpen && pickerRef.current && target && !pickerRef.current.contains(target)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen, pickerOpen]);

  // ESC đóng menu/picker.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pickerOpen) setPickerOpen(false);
      else if (menuOpen) setMenuOpen(false);
      else onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [menuOpen, pickerOpen, onClose]);

  // Khi mở picker → fetch initial products (giúp dropdown không bao giờ trống).
  useEffect(() => {
    if (!pickerOpen) return;
    void doSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void doSearch(query), 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, pickerOpen]);

  async function doSearch(q: string) {
    setSearching(true);
    try {
      // Ưu tiên SKU của dòng làm hint exact-match.
      const skuHint = cleanInvoice(row.internalProductCode);
      const params = new URLSearchParams({
        q: q.trim(),
        limit: "20"
      });
      if (skuHint && !q.trim()) params.set("sku", skuHint);
      const res = await fetch(`/api/products/search?${params.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const exact = (data?.exact ?? null) as ProductSummary | null;
      const rest = Array.isArray(data?.results) ? (data.results as ProductSummary[]) : [];
      const merged: ProductSummary[] = [];
      const seen = new Set<string>();
      const push = (p: ProductSummary | null) => {
        if (!p || seen.has(p.id)) return;
        seen.add(p.id);
        merged.push(p);
      };
      push(exact);
      rest.forEach(push);
      setRemoteResults(merged);
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }

  const handlePickExisting = () => {
    setMenuOpen(false);
    setPickerOpen(true);
  };

  const handlePickNew = () => {
    setMenuOpen(false);
    setManualOpen(true);
  };

  // Tự tạo mã SKU nếu để trống — phải có chữ "SKU" ở đầu.
  function autoSku(): string {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.floor(Math.random() * 1000)
      .toString(36)
      .toUpperCase()
      .padStart(2, "0");
    return `SKU-${ts}${rand}`;
  }

  async function applyPick(product: ProductSummary) {
    setSubmitting(true);
    try {
      // Đảm bảo SKU có chữ "SKU" ở đầu — nếu SP không có SKU thì tự tạo.
      const rawSku = cleanInvoice(product.sku) || autoSku();
      const sku = /^SKU/i.test(rawSku) ? rawSku : `SKU-${rawSku.replace(/^[^A-Z0-9]+/i, "")}`;
      // /api/products/search chỉ trả về `product.name` (từ bảng products).
      // Ưu tiên `name` trước; nếu API cũ chỉ trả legacy fields thì fallback
      // từng bước (inputProductName → retailName → adjustedInvoiceName).
      const productDisplayName =
        cleanInvoice(product.name) ||
        cleanInvoice(product.inputProductName) ||
        cleanInvoice(product.retailName) ||
        cleanInvoice(product.adjustedInvoiceName);
      // Auto-fill: luôn fill cả 3 cột tên (tên hàng đầu vào + tên bán lẻ + tên
      // chỉnh lại) + đơn vị từ SP user vừa chọn. Nếu SP không có field legacy
      // nào thì fallback về `name` chung để các cột không bị trống.
      const legacyRetail = cleanInvoice(product.retailName);
      const legacyAdjusted = cleanInvoice(product.adjustedInvoiceName);
      const patch: Partial<InvoiceRow> = {
        internalProductCode: sku,
        inputProductName: productDisplayName || cleanInvoice(row.inputProductName),
        adjustedInvoiceName: legacyAdjusted || legacyRetail || productDisplayName || cleanInvoice(row.adjustedInvoiceName),
        retailName: legacyRetail || productDisplayName || cleanInvoice(row.retailName),
        unit: cleanInvoice(product.unit) || cleanInvoice(row.unit)
      };
      const ok = await onApply(patch);
      if (ok) setPickerOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function applyManual() {
    setSubmitting(true);
    setManualError("");
    try {
      const name = cleanInvoice(manualForm.name) || cleanInvoice(row.inputProductName);
      let sku = cleanInvoice(manualForm.sku);
      if (!sku) sku = autoSku();
      else if (!/^SKU/i.test(sku)) sku = `SKU-${sku}`;
      const unit = cleanInvoice(manualForm.unit);
      const price = Number(manualForm.price) || 0;
      const costPrice = Number(manualForm.costPrice) || 0;

      // Tạo THẬT sản phẩm ngay tại đây (trước đây chỉ điền tạm field lên dòng
      // scan, sản phẩm thật chỉ được tạo sau ở bước "Tạo đơn nhập" — với giá
      // bán luôn = 0 vì bước đó không hỏi giá). Tạo ngay giúp: (1) sản phẩm
      // xuất hiện trong danh sách sản phẩm ngay lập tức, (2) bước "Tạo đơn
      // nhập" sau này match đúng sản phẩm này qua synced_product_id/SKU thay
      // vì tạo trùng 1 sản phẩm khác thiếu giá.
      const createRes = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sku,
          unit: unit || undefined,
          price,
          cost_price: costPrice,
          status: "active",
          track_inventory: true
        })
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        setManualError(data?.error || "Không tạo được sản phẩm mới.");
        return;
      }
      const created = await createRes.json();

      // Gán ảnh vừa upload (nếu có) vào product_images — products KHÔNG có
      // cột image_url, ảnh luôn sống ở bảng riêng (xem CLAUDE.md).
      if (manualImageUrl && created?.id) {
        await fetch(`/api/products/${created.id}/images`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: [{ url: manualImageUrl }] })
        }).catch(() => undefined);
      }

      // Auto-fill cả 3 cột tên từ tên user vừa nhập: tên hàng đầu vào, tên bán lẻ
      // và tên chỉnh lại. Nếu 1 trong 3 cột đã có sẵn giá trị thì GIỮ NGUYÊN
      // (không ghi đè dữ liệu user đã tự điền trước đó).
      const patch: Partial<InvoiceRow> = {
        internalProductCode: sku,
        inputProductName: name,
        unit,
        retailName: cleanInvoice(row.retailName) || name,
        adjustedInvoiceName: cleanInvoice(row.adjustedInvoiceName) || name,
        syncedProductId: created?.id ? String(created.id) : undefined
      };
      const ok = await onApply(patch);
      if (ok) setManualOpen(false);
    } catch (e) {
      setManualError(e instanceof Error ? e.message : "Lỗi không xác định.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" onClick={onClose}>
      <div
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <PackagePlus className="h-5 w-5 text-primary" />
              Gắn sản phẩm cho dòng scan
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {row.sourceFileName ? (
                <>
                  File <span className="font-medium">{row.sourceFileName}</span> ·{" "}
                  Tên: <span className="font-medium">{cleanInvoice(row.inputProductName) || "(chưa có)"}</span>
                  {cleanInvoice(row.internalProductCode) ? (
                    <> · SKU hiện tại: <span className="font-mono">{row.internalProductCode}</span></>
                  ) : null}
                </>
              ) : (
                "Chọn cách gắn sản phẩm cho dòng tổng hợp này."
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {/* Menu 2 options */}
          {menuOpen ? (
            <div ref={menuRef} className="space-y-2">
              <button
                type="button"
                onClick={handlePickExisting}
                className="group flex w-full items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50"
              >
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">
                    Đã có sản phẩm này trong danh sách sản phẩm
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600">
                    Tìm theo SKU hoặc tên rồi chọn. Hệ thống sẽ tự điền SKU, tên
                    sản phẩm, tên chỉnh lại, tên bán lẻ và đơn vị.
                  </div>
                </div>
                <ChevronDown className="mt-1 h-4 w-4 rotate-[-90deg] text-emerald-700" />
              </button>
              <button
                type="button"
                onClick={handlePickNew}
                className="group flex w-full items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-left transition hover:border-blue-400 hover:bg-blue-50"
              >
                <PackagePlus className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">
                    Sản phẩm này chưa có trong danh sách sản phẩm
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600">
                    Điền tên, mã SKU (tự tạo nếu bỏ trống), đơn vị, giá bán và giá
                    vốn — sản phẩm sẽ được tạo ngay. Tên bán lẻ và tên chỉnh lại
                    sẽ giữ trống để bạn điền sau.
                  </div>
                </div>
                <ChevronDown className="mt-1 h-4 w-4 rotate-[-90deg] text-blue-700" />
              </button>
            </div>
          ) : null}

          {/* Picker: tìm sản phẩm có sẵn */}
          {pickerOpen ? (
            <div ref={pickerRef} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm theo tên hoặc SKU…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
                {searching ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Đóng"
                  title="Đóng"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-72 overflow-auto py-1">
                {remoteResults.length === 0 && !searching ? (
                  <div className="px-3 py-6 text-center text-xs text-slate-500">
                    Không tìm thấy sản phẩm phù hợp.
                    <br />
                    Bấm <button
                      type="button"
                      className="text-blue-600 font-semibold hover:underline"
                      onClick={() => { setPickerOpen(false); setManualOpen(true); }}
                    >"Sản phẩm này chưa có trong danh sách sản phẩm"</button>
                    {" "}để tạo mới.
                  </div>
                ) : null}
                {remoteResults.map((p) => {
                  // API /api/products/search trả về `name` từ products.name.
                  // Các field cũ (retailName/adjustedInvoiceName/inputProductName) chỉ
                  // có trong legacy Lookups.products (product_catalog). Trước đây
                  // code chỉ check 3 field cũ → luôn fallback "(không tên)". Ưu tiên
                  // `p.name` (đúng dữ liệu search trả về) trước, rồi mới fallback
                  // legacy fields để không vỡ khi API cũ vẫn populate.
                  const canonicalName =
                    cleanInvoice(p.name) ||
                    cleanInvoice(p.retailName) ||
                    cleanInvoice(p.adjustedInvoiceName) ||
                    cleanInvoice(p.inputProductName);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={submitting}
                      onClick={() => void applyPick(p)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 text-transparent" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-900" title={canonicalName}>
                          {canonicalName || "(không tên)"}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          SKU <span className="font-mono">{p.sku || "—"}</span>
                          {p.unit ? ` · ${p.unit}` : ""}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                Gõ để tìm nhanh. Có thể bấm "Sản phẩm này chưa có…" ở menu để tạo mới.
              </div>
            </div>
          ) : null}

          {/* Manual form: điền tay */}
          {manualOpen ? (
            <div className="space-y-3 rounded-lg border border-blue-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">
                  Tạo sản phẩm mới
                </div>
                <button
                  type="button"
                  onClick={() => setManualOpen(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Đóng"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Ảnh sản phẩm
                </label>
                <div
                  onClick={() => !uploadingImage && imageInputRef.current?.click()}
                  className="relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50 hover:border-primary/50 hover:bg-slate-100"
                >
                  {uploadingImage ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  ) : manualImageUrl ? (
                    <>
                      <img src={manualImageUrl} alt="Preview" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setManualImageUrl("");
                        }}
                        className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-bold text-white opacity-0 transition-opacity hover:opacity-100"
                      >
                        Xoá ảnh
                      </button>
                    </>
                  ) : (
                    <ImageIcon className="h-6 w-6 text-slate-300" />
                  )}
                </div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImagePick(file);
                    e.target.value = "";
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Tên sản phẩm
                </label>
                <input
                  type="text"
                  value={manualForm.name}
                  onChange={(e) => setManualForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Tên hàng hóa đầu vào / tên hóa đơn"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Mã SKU <span className="text-[10px] font-normal text-slate-400">(để trống sẽ tự tạo)</span>
                  </label>
                  <input
                    type="text"
                    value={manualForm.sku}
                    onChange={(e) => setManualForm((f) => ({ ...f, sku: e.target.value }))}
                    placeholder="SKU tự động — ví dụ: SKU-AB12CD"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {!cleanInvoice(manualForm.sku) ? (
                    <div className="mt-1 text-[11px] text-slate-500">
                      Sẽ tạo tự động: <span className="font-mono">{autoSku()}</span>
                    </div>
                  ) : !/^SKU/i.test(cleanInvoice(manualForm.sku)) ? (
                    <div className="mt-1 text-[11px] text-amber-700">
                      Sẽ lưu thành: <span className="font-mono">SKU-{cleanInvoice(manualForm.sku)}</span>
                    </div>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Đơn vị tính
                  </label>
                  <input
                    type="text"
                    value={manualForm.unit}
                    onChange={(e) => setManualForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="Cái, hộp, kg…"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Giá bán
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={manualForm.price}
                    onChange={(e) => setManualForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Giá vốn
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={manualForm.costPrice}
                    onChange={(e) => setManualForm((f) => ({ ...f, costPrice: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Sản phẩm sẽ được tạo ngay và xuất hiện trong danh sách sản phẩm.{" "}
                <strong>Tên bán lẻ</strong> và <strong>Tên chỉnh lại xuất hóa đơn</strong> sẽ giữ trống
                — bạn có thể điền trực tiếp trong bảng tổng hợp sau.
              </div>
              {manualError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {manualError}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          {manualOpen ? (
            <>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                disabled={submitting}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void applyManual()}
                disabled={submitting || !cleanInvoice(manualForm.name)}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Lưu sản phẩm
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Đóng
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
