"use client";

import { useMemo, useState, MouseEvent as ReactMouseEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Filter,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X
} from "lucide-react";
import { excelColumns, type ExcelColumnKey, type InvoiceRow, type InvoiceDocument } from "@/lib/shared/schema";
import { calculateVatFields, normalizeDateForInput, normalizeFinancials, normalizeNumberText, parseNumeric } from "@/lib/shared/format";
import { useApp } from "@/components/providers/AppProvider";

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

function fileSizeLabel(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function documentProgressText(document: InvoiceDocument) {
  const original = document.originalRowCount || document.rowCount;
  if (document.deletedRowCount > 0) return `${document.rowCount}/${original} dòng · đã xóa ${document.deletedRowCount}`;
  return `${document.rowCount} dòng`;
}

export default function SummaryPage() {
  const { store, setStore, lookups, setError, setNotice, refreshLookups } = useApp();

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
    if (!window.confirm("Xóa dòng scan nhầm này? Tài liệu sẽ ghi nhận dòng đã bị xóa thủ công.")) return;
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
    
    if (!window.confirm(confirmMessage)) return;
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

  const missingProductFields = (row: InvoiceRow) => {
    const fields = [
      ["MÃ SẢN PHẨM", row.internalProductCode],
      ["TÊN CHỈNH LẠI XUẤT HÓA ĐƠN", row.adjustedInvoiceName],
      ["TÊN BÁN LẺ", row.retailName],
      ["Tên hàng hóa đầu vào", row.inputProductName],
      ["ĐƠN VỊ TÍNH", row.unit]
    ] as const;
    return fields.filter(([, value]) => !cleanText(value)).map(([label]) => label);
  };

  const addRowToProducts = async (row: InvoiceRow) => {
    const missing = missingProductFields(row);
    if (missing.length > 0) {
      setError(`Chưa thể thêm sản phẩm. Vui lòng nhập đủ: ${missing.join(", ")}.`);
      return;
    }

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: cleanText(row.internalProductCode),
          inputProductName: cleanText(row.inputProductName),
          adjustedInvoiceName: cleanText(row.adjustedInvoiceName),
          retailName: cleanText(row.retailName),
          unit: cleanText(row.unit),
          salePrice: ""
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Không thêm được sản phẩm.");

      await refreshLookups();
      setNotice(`Đã thêm SKU ${cleanText(row.internalProductCode)} vào Sản phẩm / SKU. Xóa hóa đơn sau này sẽ không xóa sản phẩm này.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thêm được sản phẩm.");
    }
  };

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

  const renderCell = (row: InvoiceRow, key: ExcelColumnKey) => {
    const value = row[key] ?? "";
    const className = `table-field ${internalKeys.has(key) ? "manual-field" : ""} ${
      numericKeys.has(key) ? "text-right tabular-nums" : ""
    }`;

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

    if (key === "unit") {
      const currentValue = String(value);
      return (
        <input
          key={`${row.id}-${key}-${currentValue}`}
          className={className}
          defaultValue={currentValue}
          onBlur={(event) => {
            const nextValue = event.currentTarget.value;
            if (nextValue !== currentValue) commitRowPatch(row.id, { unit: nextValue });
          }}
        />
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
    return (
      <input
        key={`${row.id}-${key}-${currentValue}`}
        className={className}
        defaultValue={currentValue}
        title={currentValue}
        onBlur={(event) => {
          const nextValue = event.currentTarget.value;
          if (nextValue !== currentValue) commitRowPatch(row.id, { [key]: nextValue } as Partial<InvoiceRow>);
        }}
      />
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

                  return (
                  <tr key={row.id} className={`${isNoTaxRow(row) ? "no-tax-row" : "odd:bg-white even:bg-slate-50/40"} hover:bg-accent/40`}>
                    <td className="border-b border-r border-slate-200 px-3 py-2 text-slate-500">{index + 1}</td>
                    <td className="border-b border-r border-slate-200 px-3 py-2 text-xs text-slate-500">
                      <div className="min-w-0">
                        <div className="truncate" title={row.sourceFileName}>
                          {row.sourceFileName}
                        </div>
                        {document?.deletedRowCount ? (
                          <div className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            Đã xóa {document.deletedRowCount} dòng
                          </div>
                        ) : null}
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
                          className="rounded-lg p-2 text-primary hover:bg-blue-50"
                          onClick={() => addRowToProducts(row)}
                          title="Thêm dòng này vào Sản phẩm / SKU"
                        >
                          <Plus className="h-4 w-4" />
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
    </>
  );
}
