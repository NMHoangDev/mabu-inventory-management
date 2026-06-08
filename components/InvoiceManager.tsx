"use client";

import { type ChangeEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  LayoutDashboard,
  Loader2,
  Menu,
  Package,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Settings,
  Table2,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import {
  excelColumns,
  type AppStore,
  type ExcelColumnKey,
  type InvoiceDocument,
  type InvoiceRow
} from "@/lib/schema";
import { normalizeDateForInput, normalizeFinancials, normalizeNumberText, parseNumeric } from "@/lib/format";

type Tab =
  | "dashboard"
  | "scan"
  | "summary"
  | "documents"
  | "products"
  | "inventory"
  | "sales"
  | "reports"
  | "settings"
  | "blueprint";

type Filters = {
  supplier: string;
  product: string;
  sku: string;
  dateFrom: string;
  dateTo: string;
};

type Lookups = {
  suppliers: string[];
  inputProductNames: string[];
  internalProductCodes: string[];
  adjustedInvoiceNames: string[];
  retailNames: string[];
  units: string[];
  vatRates: string[];
  products: Array<{
    sku: string;
    inputProductName: string;
    adjustedInvoiceName: string;
    retailName: string;
    unit: string;
  }>;
};

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
  vatRate: 100,
  vatAmount: 160,
  totalAfterTax: 210,
  unitPriceAfterTax: 190,
  note: 220,
  __delete: 76
};

const emptyStore: AppStore = { documents: [], rows: [] };
const emptyLookups: Lookups = {
  suppliers: [],
  inputProductNames: [],
  internalProductCodes: [],
  adjustedInvoiceNames: [],
  retailNames: [],
  units: [],
  vatRates: [],
  products: []
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
const unitOptions = ["Cái", "Bộ", "Cuốn", "Quyển", "Gói", "Hộp", "Sợi", "Kg", "Mét"];

function fileSizeLabel(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

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

function documentStatusLabel(document: InvoiceDocument) {
  return document.status === "scanned" ? "Đã scan" : "Lỗi OCR";
}

export default function InvoiceManager() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [store, setStore] = useState<AppStore>(emptyStore);
  const [lookups, setLookups] = useState<Lookups>(emptyLookups);
  const [files, setFiles] = useState<File[]>([]);
  const [filters, setFilters] = useState<Filters>({
    supplier: "",
    product: "",
    sku: "",
    dateFrom: "",
    dateTo: ""
  });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [savingRowId, setSavingRowId] = useState("");
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [summaryColumnWidths, setSummaryColumnWidths] = useState(defaultSummaryColumnWidths);

  const navItems: Array<{ key: Tab; label: string; group: string; icon: typeof LayoutDashboard }> = [
    { key: "dashboard", label: "Dashboard", group: "Tổng quan", icon: LayoutDashboard },
    { key: "scan", label: "Scan hóa đơn", group: "Hóa đơn", icon: FileSpreadsheet },
    { key: "summary", label: "Tổng hợp hóa đơn", group: "Hóa đơn", icon: Table2 },
    { key: "documents", label: "Tài liệu hóa đơn", group: "Hóa đơn", icon: FileText },
    { key: "products", label: "Sản phẩm / SKU", group: "Vận hành", icon: Package },
    { key: "inventory", label: "Tồn kho", group: "Vận hành", icon: Boxes },
    { key: "sales", label: "Bán hàng", group: "Vận hành", icon: ShoppingCart },
    { key: "reports", label: "Báo cáo", group: "Vận hành", icon: BarChart3 },
    { key: "settings", label: "Cài đặt", group: "Hệ thống", icon: Settings }
  ];

  const loadState = async () => {
    const [stateResponse, lookupResponse] = await Promise.all([fetch("/api/state"), fetch("/api/lookups")]);
    const data = (await stateResponse.json()) as AppStore;
    const lookupData = (await lookupResponse.json()) as Lookups;
    setStore(data);
    setLookups({ ...emptyLookups, ...lookupData });
  };

  const refreshLookups = async () => {
    const response = await fetch("/api/lookups");
    const data = (await response.json()) as Lookups;
    setLookups({ ...emptyLookups, ...data });
  };

  useEffect(() => {
    loadState()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Không tải được dữ liệu."))
      .finally(() => setLoading(false));
  }, []);

  const filteredRows = useMemo(() => {
    return store.rows.filter((row) => {
      if (filters.supplier && !includesText(row.supplierName, filters.supplier)) return false;
      if (filters.product && !includesText(row.inputProductName, filters.product) && !includesText(row.adjustedInvoiceName, filters.product)) {
        return false;
      }
      if (filters.sku && !includesText(row.internalProductCode, filters.sku)) return false;
      return isDateWithin(row.invoiceDate, filters.dateFrom, filters.dateTo);
    });
  }, [filters, store.rows]);

  const totalDocuments = store.documents.length;
  const errorDocuments = store.documents.filter((document) => document.status === "error").length;
  const currentNav = navItems.find((item) => item.key === tab) ?? navItems[0];
  const navGroups = Array.from(new Set(navItems.map((item) => item.group)));
  const invoiceCount = new Set(store.rows.map((row) => `${row.supplierName}-${row.invoiceNumber}`)).size;
  const supplierCount = new Set(store.rows.map((row) => row.supplierName).filter(Boolean)).size;
  const totalBeforeTax = store.rows.reduce((total, row) => total + (parseNumeric(row.amountBeforeTax) ?? 0), 0);
  const totalVat = store.rows.reduce((total, row) => total + (parseNumeric(row.vatAmount) ?? 0), 0);
  const totalAfterTax = store.rows.reduce((total, row) => total + (parseNumeric(row.totalAfterTax) ?? 0), 0);
  const missingSku = store.rows.filter((row) => !String(row.internalProductCode).trim()).length;
  const missingAdjustedName = store.rows.filter((row) => !String(row.adjustedInvoiceName).trim()).length;
  const summaryTableWidth = useMemo(
    () => Object.values(summaryColumnWidths).reduce((total, width) => total + width, 0),
    [summaryColumnWidths]
  );

  const minWidthForSummaryColumn = (key: SummaryColumnKey) => {
    if (key === "__index") return 44;
    if (key === "__delete") return 64;
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

  const addFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    setFiles((current) => {
      const signatures = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      return [
        ...current,
        ...incoming.filter((file) => {
          const signature = `${file.name}-${file.size}-${file.lastModified}`;
          if (signatures.has(signature)) return false;
          signatures.add(signature);
          return true;
        })
      ];
    });
    setError("");
  };

  const scanFiles = async () => {
    if (files.length === 0) {
      setError("Chọn ít nhất một file PDF hoặc ảnh.");
      return;
    }

    setScanning(true);
    setError("");
    const form = new FormData();
    files.forEach((file) => form.append("files", file));

    try {
      const response = await fetch("/api/scan", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Scan thất bại.");
      setStore(data);
      await refreshLookups();
      setFiles([]);
      setTab("summary");
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Scan thất bại.");
    } finally {
      setScanning(false);
    }
  };

  const updateRowLocal = (rowId: string, key: ExcelColumnKey, value: string) => {
    setStore((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === rowId ? normalizeFinancials({ ...row, [key]: value }) : row))
    }));
  };

  const saveRow = async (row: InvoiceRow) => {
    setSavingRowId(row.id);
    try {
      const response = await fetch(`/api/rows/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row)
      });
      const data = (await response.json()) as AppStore;
      if (!response.ok) throw new Error("Không lưu được dòng.");
      setStore(data);
      await refreshLookups();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không lưu được dòng.");
    } finally {
      setSavingRowId("");
    }
  };

  const deleteRow = async (rowId: string) => {
    const response = await fetch(`/api/rows/${rowId}`, { method: "DELETE" });
    const data = (await response.json()) as AppStore;
    setStore(data);
  };

  const deleteDocument = async (documentId: string) => {
    const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
    const data = (await response.json()) as AppStore;
    setStore(data);
  };

  const exportExcel = async () => {
    if (filteredRows.length === 0) return;

    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: filteredRows })
    });
    if (!response.ok) {
      setError("Không xuất được Excel.");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tong-hop-hoa-don.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const renderCell = (row: InvoiceRow, key: ExcelColumnKey) => {
    const value = row[key] ?? "";
    const listIdByKey: Partial<Record<ExcelColumnKey, string>> = {
      supplierName: "supplier-options",
      inputProductName: "input-product-options",
      internalProductCode: "sku-options",
      adjustedInvoiceName: "adjusted-name-options",
      retailName: "retail-name-options"
    };
    const className = `table-field ${internalKeys.has(key) ? "manual-field" : ""} ${
      numericKeys.has(key) ? "text-right tabular-nums" : ""
    }`;

    if (key === "invoiceDate") {
      return (
        <input
          className={className}
          type="date"
          value={normalizeDateForInput(value)}
          onChange={(event) => updateRowLocal(row.id, key, event.target.value)}
          onBlur={() => saveRow(row)}
        />
      );
    }

    if (key === "unit") {
      return (
        <input
          className={className}
          list="unit-options"
          value={String(value)}
          onChange={(event) => updateRowLocal(row.id, key, event.target.value)}
          onBlur={() => saveRow(row)}
        />
      );
    }

    if (key === "vatRate") {
      return (
        <input
          className={className}
          list="vat-options"
          inputMode="decimal"
          value={String(value)}
          onChange={(event) => updateRowLocal(row.id, key, event.target.value.replace(/[^\d.,%-]/g, ""))}
          onBlur={(event) => {
            updateRowLocal(row.id, key, normalizeNumberText(event.target.value));
            saveRow({ ...row, [key]: normalizeNumberText(event.target.value) });
          }}
        />
      );
    }

    if (numericKeys.has(key)) {
      return (
        <input
          className={className}
          inputMode="decimal"
          value={String(value)}
          onChange={(event) => updateRowLocal(row.id, key, event.target.value.replace(/[^\d.,-]/g, ""))}
          onBlur={(event) => {
            updateRowLocal(row.id, key, normalizeNumberText(event.target.value));
            saveRow({ ...row, [key]: normalizeNumberText(event.target.value) });
          }}
        />
      );
    }

    return (
      <input
        className={className}
        list={listIdByKey[key]}
        value={String(value)}
        title={String(value)}
        onChange={(event) => updateRowLocal(row.id, key, event.target.value)}
        onBlur={() => saveRow(row)}
      />
    );
  };

  const renderSummaryHeader = (key: SummaryColumnKey, label: string, className = "") => (
    <th
      key={key}
      className={`resizable-th border-b border-r border-slate-200 px-3 py-2.5 text-left ${className}`}
      style={{ width: summaryColumnWidths[key] }}
      title={label}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate">{label}</span>
      </div>
      <button
        type="button"
        className="column-resize-handle"
        aria-label={`Kéo chỉnh độ rộng cột ${label}`}
        onMouseDown={(event) => startColumnResize(key, event)}
      />
    </th>
  );

  const renderSidebar = (isCollapsed = false) => (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden text-sidebar-foreground">
      <div className={`flex h-14 w-full shrink-0 items-center gap-2.5 border-b border-sidebar-border/60 ${isCollapsed ? "justify-center px-2" : "px-3"}`}>
        <div className="brand-gradient grid h-8 w-8 place-items-center rounded-lg text-xs font-bold text-primary-foreground shadow-elegant">
          IF
        </div>
        {!isCollapsed ? (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-tight tracking-tight">InvoiceFlow</div>
            <div className="truncate text-[10px] leading-tight text-sidebar-foreground/58">Manager · Supabase</div>
          </div>
        ) : null}
      </div>

      <nav className={`w-full flex-1 space-y-1 overflow-hidden py-2 ${isCollapsed ? "px-2" : "px-2"}`}>
        {navGroups.map((group) => (
          <div key={group}>
            {!isCollapsed ? (
              <div className="mb-0.5 px-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/52">
                {group}
              </div>
            ) : null}
            <div className="space-y-0.5">
              {navItems
                .filter((item) => item.group === group)
                .map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      title={isCollapsed ? item.label : undefined}
                      onClick={() => {
                        setTab(item.key);
                        setMobileOpen(false);
                      }}
                      className={`relative flex w-full items-center rounded-lg text-[13px] leading-5 transition-all ${
                        isCollapsed ? "mx-auto h-9 w-9 justify-center" : "gap-2.5 px-2.5 py-1.5"
                      } ${
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      {active && !isCollapsed ? <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-r bg-sidebar-primary" /> : null}
                      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-sidebar-primary" : ""}`} />
                      {!isCollapsed ? <span className="truncate">{item.label}</span> : null}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>

      {!isCollapsed ? (
        <div className="flex w-full shrink-0 items-center gap-2 border-t border-sidebar-border/60 px-3 py-2">
          <div className="brand-gradient grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-semibold text-primary-foreground shadow-elegant">
            NV
          </div>
          <div className="min-w-0 text-[11px] leading-tight">
            <div className="truncate font-medium text-sidebar-foreground">Công ty ABC</div>
            <div className="truncate text-sidebar-foreground/60">nhân viên · kho HCM</div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <main className="min-h-screen bg-background">
      <datalist id="unit-options">
        {Array.from(new Set([...unitOptions, ...lookups.units])).map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
      <datalist id="vat-options">
        {Array.from(new Set([...vatOptions, ...lookups.vatRates])).map((vat) => (
          <option key={vat} value={vat} />
        ))}
      </datalist>
      <datalist id="supplier-options">
        {lookups.suppliers.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="input-product-options">
        {lookups.inputProductNames.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="sku-options">
        {lookups.internalProductCodes.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="adjusted-name-options">
        {lookups.adjustedInvoiceNames.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="retail-name-options">
        {lookups.retailNames.map((value) => <option key={value} value={value} />)}
      </datalist>

      <aside className={`fixed inset-y-0 left-0 z-40 hidden h-screen shrink-0 overflow-hidden border-r border-sidebar-border/50 bg-sidebar transition-[width] duration-200 ease-out lg:flex ${collapsed ? "w-[60px]" : "w-[216px]"}`}>
        {renderSidebar(collapsed)}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button className="absolute inset-0 bg-foreground/50 backdrop-blur-sm" aria-label="Đóng menu" onClick={() => setMobileOpen(false)} />
          <div className="relative flex w-72 max-w-[82vw] flex-col bg-sidebar shadow-elegant">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
            {renderSidebar(false)}
          </div>
        </div>
      ) : null}

      <div className={`flex min-h-screen min-w-0 flex-col transition-[margin-left] duration-200 ease-out ${collapsed ? "lg:ml-[60px]" : "lg:ml-[216px]"}`}>
        <header className={`fixed inset-x-0 top-0 z-30 border-b bg-card/95 backdrop-blur-xl transition-[left] duration-200 ease-out ${collapsed ? "lg:left-[60px]" : "lg:left-[216px]"}`}>
          <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              className="-ml-2 rounded-md p-2 hover:bg-muted lg:hidden"
              aria-label="Mở menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              onClick={() => setCollapsed((value) => !value)}
              className="-ml-1 hidden h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
              aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
              title={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold tracking-tight">{currentNav.label}</h1>
            </div>
            <button
              className="hidden h-9 w-72 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/70 md:flex"
              onClick={() => setTab("summary")}
              type="button"
            >
              <Search className="h-4 w-4" />
              <span>Tìm kiếm nhanh...</span>
              <kbd className="ml-auto rounded border bg-card px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
            </button>
            <button className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Thông báo" type="button">
              <Bell className="h-4 w-4" />
              {errorDocuments > 0 ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" /> : null}
            </button>
            <div className="brand-gradient grid h-9 w-9 place-items-center rounded-full text-xs font-semibold text-primary-foreground shadow-elegant">
              NV
            </div>
          </div>
        </header>

        <div className="subtle-gradient flex-1 space-y-4 px-4 pb-24 pt-[4.5rem] lg:px-6 lg:pb-7 lg:pt-20">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="panel flex min-h-[320px] items-center justify-center gap-2 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Đang tải dữ liệu
          </div>
        ) : null}

        {!loading && tab === "dashboard" ? (
          <section className="space-y-4">
            <div className="panel flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="section-title">Hóa đơn</div>
                <div className="section-caption mt-0.5">
                  {fmtNumber(invoiceCount)} hóa đơn · {fmtNumber(store.rows.length)} dòng · {fmtNumber(errorDocuments)} lỗi OCR
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90" onClick={() => setTab("scan")}>
                  Scan hóa đơn
                </button>
                <button className="rounded-md border bg-white px-3.5 py-2 text-sm font-semibold hover:bg-secondary" onClick={() => setTab("summary")}>
                  Tổng hợp
                </button>
                <button className="rounded-md border bg-white px-3.5 py-2 text-sm font-semibold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50" onClick={exportExcel} disabled={store.rows.length === 0}>
                  Xuất Excel
                </button>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="panel p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Hóa đơn scan gần đây</h2>
                    <p className="text-xs text-muted-foreground">Dữ liệu lấy từ Supabase/Postgres khi cấu hình DATABASE_URL</p>
                  </div>
                  <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => setTab("scan")}>
                    Upload thêm
                  </button>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <table className="data-table w-full text-sm">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left">File</th>
                        <th className="px-3 py-2 text-left">Trạng thái</th>
                        <th className="px-3 py-2 text-right">Dòng</th>
                        <th className="px-3 py-2 text-left">Ngày upload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {store.documents.slice(0, 6).map((document) => (
                        <tr key={document.id} className="border-t">
                          <td className="max-w-[320px] truncate px-3 py-2 font-medium">{document.fileName}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${document.status === "scanned" ? "bg-emerald-50 text-emerald-700" : "bg-warning-bg text-warning-foreground"}`}>
                              {documentStatusLabel(document)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{document.rowCount}</td>
                          <td className="px-3 py-2 text-muted-foreground">{document.uploadedAt.slice(0, 10)}</td>
                        </tr>
                      ))}
                      {store.documents.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">Chưa có hóa đơn nào. Bấm Upload thêm để scan.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel overflow-hidden">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-semibold">Cảnh báo cần xử lý</h2>
                </div>
                <div className="divide-y divide-slate-200">
                  {[
                    ["Dòng thiếu MÃ SẢN PHẨM", missingSku],
                    ["Dòng thiếu TÊN CHỈNH LẠI", missingAdjustedName],
                    ["Tài liệu OCR lỗi", errorDocuments],
                    ["Dòng thiếu tên bán lẻ", store.rows.filter((row) => !String(row.retailName).trim()).length]
                  ].map(([label, count]) => (
                    <div key={String(label)} className="flex items-center justify-between bg-warning-bg/55 px-4 py-3">
                      <div className="text-sm">{label}</div>
                      <div className="font-semibold text-warning-foreground tabular-nums">{count}</div>
                    </div>
                  ))}
                </div>
                <button className="m-4 w-[calc(100%-2rem)] rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90" onClick={() => setTab("summary")}>
                  Mở tổng hợp hóa đơn
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && tab === "summary" ? (
          <section className="space-y-3">
            <div className="panel px-3 py-2.5">
              <div className="mb-2 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 pr-2 font-semibold">
                    <Filter className="h-4 w-4 text-primary" />
                    Bộ lọc tổng hợp
                  </div>
                  {[
                    ["Tài liệu", totalDocuments],
                    ["Dòng", store.rows.length],
                    ["Đang lọc", filteredRows.length],
                    ["Lỗi OCR", errorDocuments]
                  ].map(([label, value]) => (
                    <div key={String(label)} className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-secondary/60 px-2.5 text-xs text-muted-foreground">
                      <span>{label}</span>
                      <span className="font-semibold text-foreground tabular-nums">{fmtNumber(Number(value))}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  onClick={exportExcel}
                  disabled={filteredRows.length === 0}
                >
                  <Download className="h-4 w-4" />
                  Xuất Excel
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-5">
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
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Từ ngày</span>
                  <input className="field h-9 py-1.5" type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Đến ngày</span>
                  <input className="field h-9 py-1.5" type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
                </label>
              </div>
            </div>

            <div className="panel overflow-hidden">
              <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 font-semibold">
                  <Search className="h-4 w-4 text-primary" />
                  Tổng hợp hóa đơn đã scan
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {savingRowId ? <span>Đang lưu...</span> : <span>Tự lưu khi rời ô</span>}
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
              <div className="max-h-[calc(100vh-285px)] overflow-auto">
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
                      {renderSummaryHeader("__delete", "Xóa", "border-r-0 text-center")}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, index) => (
                      <tr key={row.id} className="odd:bg-white even:bg-slate-50/40 hover:bg-accent/40">
                        <td className="border-b border-r border-slate-200 px-3 py-2 text-slate-500">{index + 1}</td>
                        <td className="border-b border-r border-slate-200 px-3 py-2 text-xs text-slate-500">
                          <div className="truncate" title={row.sourceFileName}>
                            {row.sourceFileName}
                          </div>
                        </td>
                        {excelColumns.map((column) => (
                          <td key={column.key} className="border-b border-r border-slate-200 p-1">
                            {renderCell(row, column.key)}
                          </td>
                        ))}
                        <td className="border-b border-slate-200 px-2 py-2 text-center">
                          <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => deleteRow(row.id)} title="Xóa dòng scan nhầm">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 ? (
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
        ) : null}

        {!loading && tab === "documents" ? (
          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2 font-semibold">
                <History className="h-4 w-4 text-primary" />
                Lịch sử và quản lý tài liệu
              </div>
              <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white" onClick={() => setTab("scan")}>
                <Plus className="h-4 w-4" />
                Thêm tài liệu
              </button>
            </div>
            <div className="divide-y divide-slate-200">
              {store.documents.map((document) => (
                <div key={document.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_120px_120px_120px_48px] md:items-center">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{document.fileName}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {fileSizeLabel(document.fileSize)} · {new Date(document.uploadedAt).toLocaleString("vi-VN")}
                    </div>
                    {document.warnings.length > 0 ? (
                      <div className="mt-2 rounded-lg bg-honey-50 px-3 py-2 text-sm text-amber-800">{document.warnings.join(" | ")}</div>
                    ) : null}
                  </div>
                  <div className="text-sm text-slate-600">{documentStatusLabel(document)}</div>
                  <div className="text-sm text-slate-600">{document.rowCount} dòng</div>
                  <div className="font-mono text-xs text-slate-400">{document.id.slice(0, 10)}</div>
                  <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => deleteDocument(document.id)} title="Xóa tài liệu và các dòng thuộc tài liệu">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {store.documents.length === 0 ? <div className="px-5 py-12 text-center text-slate-500">Chưa có tài liệu.</div> : null}
            </div>
          </section>
        ) : null}

        {!loading && tab === "scan" ? (
          <section className="panel grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]">
            <div
              className="flex min-h-[390px] flex-col items-center justify-center border-b border-slate-200 p-8 text-center lg:border-b-0 lg:border-r"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addFiles(event.dataTransfer.files);
              }}
            >
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent text-primary shadow-soft">
                <UploadCloud className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold">Thả hóa đơn PDF/ảnh vào đây</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Nếu file đã từng scan, hệ thống nhận ra theo nội dung file và không scan lại.</p>
              <input
                ref={inputRef}
                className="hidden"
                type="file"
                multiple
                accept="application/pdf,image/*"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  if (event.target.files) addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <button className="mt-5 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90" onClick={() => inputRef.current?.click()}>
                Chọn file
              </button>
              <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-3">
                {["Upload", "OCR Gemini", "Lưu tổng hợp"].map((label, index) => (
                  <div key={label} className="rounded-md border-l-2 border-l-primary bg-secondary/50 px-3 py-2 text-left">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bước {index + 1}</div>
                    <div className="mt-1 text-sm font-medium">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4 font-semibold">File chờ scan</div>
              <div className="max-h-[360px] overflow-auto">
                {files.map((file, index) => (
                  <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{file.name}</div>
                      <div className="text-xs text-slate-500">{fileSizeLabel(file.size)}</div>
                    </div>
                    <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {files.length === 0 ? <div className="px-5 py-12 text-center text-slate-500">Chưa chọn file.</div> : null}
              </div>
              <div className="border-t border-slate-200 p-5">
                <button
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  onClick={scanFiles}
                  disabled={scanning || files.length === 0}
                >
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Scan và lưu vào tổng hợp
                </button>
              </div>
            </aside>
          </section>
        ) : null}

        {!loading && ["products", "inventory", "sales", "reports", "settings"].includes(tab) ? (
          <section className="space-y-5">
            <div className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{currentNav.group}</div>
                  <h2 className="mt-1 text-2xl font-semibold">{currentNav.label}</h2>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    Khung demo theo hướng phần mềm bán hàng dạng web: lấy SKU từ hóa đơn, hỗ trợ mapping sản phẩm, tồn kho và báo cáo định kỳ.
                  </p>
                </div>
                <button className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted" onClick={() => setTab("blueprint")}>
                  Xem blueprint
                </button>
              </div>
            </div>

            {tab === "products" ? (
              <div className="panel overflow-hidden">
                <div className="border-b px-4 py-3 text-sm font-semibold">Sản phẩm / SKU gợi ý từ dữ liệu hóa đơn</div>
                <div className="overflow-x-auto">
                  <table className="data-table w-full min-w-[900px] text-sm">
                    <thead>
                      <tr>
                        {["SKU", "Tên hàng đầu vào", "Tên xuất hóa đơn", "Tên bán lẻ", "ĐVT", "Trạng thái"].map((header) => (
                          <th key={header} className="px-3 py-2 text-left">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {store.rows.slice(0, 8).map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-2 font-semibold">{row.internalProductCode || <span className="text-warning-foreground">Cần nhập</span>}</td>
                          <td className="px-3 py-2">{row.inputProductName}</td>
                          <td className="px-3 py-2">{row.adjustedInvoiceName || "-"}</td>
                          <td className="px-3 py-2">{row.retailName || "-"}</td>
                          <td className="px-3 py-2">{row.unit}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.internalProductCode ? "bg-emerald-50 text-emerald-700" : "bg-warning-bg text-warning-foreground"}`}>
                              {row.internalProductCode ? "Đã map" : "Thiếu SKU"}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {store.rows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">Chưa có dữ liệu sản phẩm. Scan hóa đơn để tạo gợi ý SKU.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {tab === "inventory" ? (
              <div className="grid gap-4 lg:grid-cols-3">
                {[
                  ["Tổng SKU", fmtNumber(new Set(store.rows.map((row) => row.internalProductCode).filter(Boolean)).size)],
                  ["SL nhập từ HĐ", fmtNumber(store.rows.reduce((total, row) => total + (parseNumeric(row.quantity) ?? 0), 0))],
                  ["Dòng chưa map kho", fmtNumber(missingSku)]
                ].map(([label, value]) => (
                  <div key={label} className="panel p-5">
                    <div className="text-sm text-muted-foreground">{label}</div>
                    <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
                  </div>
                ))}
                <div className="panel p-5 lg:col-span-3">
                  <h3 className="text-sm font-semibold">Mock tồn kho</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {["Kho HCM", "Kho Hà Nội", "Web bán hàng"].map((item, index) => (
                      <div key={item} className="rounded-lg border bg-card p-4">
                        <div className="font-semibold">{item}</div>
                        <div className="mt-2 text-sm text-muted-foreground">{index === 2 ? "Chuẩn bị đồng bộ sản phẩm/SKU lên website." : "Chờ nối dữ liệu tồn kho thực tế."}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "sales" ? (
              <div className="panel overflow-hidden">
                <div className="border-b px-4 py-3 text-sm font-semibold">Đơn hàng mẫu</div>
                <div className="grid gap-3 p-4 md:grid-cols-3">
                  {["Sapo POS", "Website", "Facebook/Zalo"].map((channel, index) => (
                    <div key={channel} className="rounded-lg border p-4">
                      <div className="text-sm text-muted-foreground">Kênh bán</div>
                      <div className="mt-1 font-semibold">{channel}</div>
                      <div className="mt-3 text-2xl font-semibold tabular-nums">{fmtCurrency((index + 1) * 12_500_000)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {tab === "reports" ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="panel p-5">
                  <h3 className="text-sm font-semibold">Báo cáo nhập hàng</h3>
                  <div className="mt-4 space-y-3">
                    {Array.from(new Set(store.rows.map((row) => row.supplierName).filter(Boolean))).slice(0, 5).map((supplier) => {
                      const total = store.rows.filter((row) => row.supplierName === supplier).reduce((sum, row) => sum + (parseNumeric(row.amountBeforeTax) ?? 0), 0);
                      return (
                        <div key={supplier}>
                          <div className="mb-1 flex justify-between gap-3 text-sm">
                            <span className="truncate">{supplier}</span>
                            <span className="tabular-nums">{fmtCurrency(total)}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded bg-muted">
                            <div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, totalBeforeTax ? (total / totalBeforeTax) * 100 : 0)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {store.rows.length === 0 ? <div className="text-sm text-muted-foreground">Chưa có dữ liệu nhập hàng để lập báo cáo.</div> : null}
                  </div>
                </div>
                <div className="panel p-5">
                  <h3 className="text-sm font-semibold">Xuất Excel định kỳ</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Excel là bản lưu trữ. Dữ liệu làm việc chính vẫn nằm trên Supabase/web app.</p>
                  <button className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90" onClick={exportExcel}>
                    Xuất tổng hợp hiện tại
                  </button>
                </div>
              </div>
            ) : null}

            {tab === "settings" ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="panel p-5">
                  <h3 className="text-sm font-semibold">Lưu trữ</h3>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>Database</span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Supabase Postgres</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>File gốc</span>
                      <span className="rounded-full bg-info-bg px-2.5 py-1 text-xs font-semibold text-info">Supabase Storage / fallback local</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>OCR</span>
                      <span className="rounded-full bg-warning-bg px-2.5 py-1 text-xs font-semibold text-warning-foreground">Gemini Vision</span>
                    </div>
                  </div>
                </div>
                <div className="panel p-5">
                  <h3 className="text-sm font-semibold">Quick options</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Supplier, SKU, tên chỉnh lại, tên bán lẻ, đơn vị tính và VAT được lưu lại để gợi ý nhanh trong form/bảng.
                  </p>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {!loading && tab === "blueprint" ? (
          <section className="space-y-5">
            <div className="panel p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide text-primary">Design blueprint</div>
                  <h2 className="mt-2 text-3xl font-bold">Khung trang quản lý InvoiceFlow</h2>
                  <p className="mt-2 max-w-3xl text-slate-500">
                    Dùng làm mẫu để dựng demo quản lý sau: scan OCR hóa đơn, lưu web, quản lý tài liệu, tổng hợp hóa đơn, lọc dữ liệu, xuất Excel định kỳ và khung vận hành.
                  </p>
                </div>
                <div className="rounded-2xl bg-accent p-4 text-primary">
                  <ShieldCheck className="h-10 w-10" />
                </div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {[
                ["01", "Upload & OCR", "Khu upload PDF/ảnh, trạng thái đang scan, cảnh báo OCR, nhận diện file trùng theo hash."],
                ["02", "Review & Tổng hợp", "Bảng editable kiểu Excel, tự lưu khi rời ô, xóa từng dòng scan nhầm, lọc theo nghiệp vụ."],
                ["03", "Tài liệu & Lịch sử", "Danh sách file đã xử lý, xóa tài liệu kéo theo rows, không scan lại tài liệu đã có."],
                ["04", "Vận hành demo", "Module placeholder cho sản phẩm, tồn kho, đồng bộ web bán hàng kiểu Sapo/Sales dashboard."],
                ["05", "Báo cáo", "KPI, lịch sử xuất Excel, báo cáo định kỳ và cảnh báo dữ liệu thiếu."],
                ["06", "Cài đặt", "Khung cấu hình OCR, lưu trữ Supabase, gợi ý nhanh và mẫu export."]
              ].map(([step, title, desc]) => (
                <div key={step} className="panel p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">{step}</div>
                  <h3 className="mt-4 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
              <div className="panel overflow-hidden">
                <div className="border-b border-slate-200 px-5 py-4 font-semibold">Navigation mẫu</div>
                <div className="space-y-2 p-4">
                  {["Dashboard", "Scan hóa đơn", "Tổng hợp hóa đơn", "Tài liệu", "Sản phẩm", "Tồn kho", "Bán hàng", "Báo cáo", "Cài đặt"].map((item, index) => (
                    <div key={item} className={`rounded-xl px-4 py-3 text-sm font-semibold ${index === 2 ? "bg-primary text-white" : "bg-slate-50 text-slate-600"}`}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel overflow-hidden">
                <div className="border-b border-slate-200 px-5 py-4 font-semibold">Bảng dữ liệu mẫu</div>
                <div className="overflow-auto">
                  <table className="data-table w-full min-w-[900px] border-collapse text-sm">
                    <thead className="bg-accent text-accent-foreground">
                      <tr>
                        {["Ngày", "Nhà cung cấp", "Sản phẩm", "SKU", "SL", "Thành tiền", "Trạng thái"].map((header) => (
                          <th key={header} className="border-b border-r border-slate-200 px-4 py-3 text-left">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["07/06/2026", "Á Châu Logistics", "Ví cầm tay", "VCT001", "450", "7,144,200", "Đã lưu"],
                        ["07/06/2026", "ASM", "Cuốn dính số 5", "LDN00196", "120", "1,584,000", "Thiếu SKU"],
                        ["07/06/2026", "Mỹ Thanh", "Sổ bìa cứng", "SDA000245", "60", "570,000", "Đã lưu"]
                      ].map((row) => (
                        <tr key={row.join("-")} className="hover:bg-accent/40">
                          {row.map((cell, index) => (
                            <td key={`${cell}-${index}`} className="border-b border-r border-slate-200 px-4 py-3">
                              {index === 6 ? <span className="rounded-full bg-honey-50 px-3 py-1 text-xs font-semibold text-amber-800">{cell}</span> : cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="panel p-5">
              <h3 className="text-lg font-bold">Nguyên tắc UI cho demo</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Màu chính", "Xanh cobalt cho hành động chính, vàng kem cho ô nhập tay hoặc dữ liệu thiếu."],
                  ["Bảng", "Header sticky, scroll ngang, input trong cell, autosave khi blur, có nút xóa dòng."],
                  ["Form", "Ngày dùng date picker, số dùng numeric input, trường nội bộ để trống và highlight."],
                  ["Tài liệu", "Mỗi file có lịch sử, trạng thái OCR, cảnh báo và xóa cascade."]
                ].map(([title, desc]) => (
                  <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="font-semibold">{title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 shadow-elegant backdrop-blur lg:hidden">
          {[
            { key: "dashboard" as Tab, icon: LayoutDashboard, label: "Bảng" },
            { key: "scan" as Tab, icon: FileSpreadsheet, label: "Scan" },
            { key: "summary" as Tab, icon: Table2, label: "Tổng hợp" },
            { key: "products" as Tab, icon: Package, label: "Vận hành" },
            { key: "settings" as Tab, icon: Settings, label: "Cài đặt" }
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${active ? "font-medium text-primary" : "text-muted-foreground"}`}
              >
                <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </main>
  );
}

