"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/invoice-flow-manager-fe/components/providers/AppProvider";
import { normalizeFinancials, normalizeNumberText, parseNumeric, cleanInvoiceProductName, formatCurrencyVND } from "@/lib/shared/format";
import type { InvoiceRow } from "@/lib/shared/schema";
import {
  Plus,
  Search,
  Image as ImageIcon,
  ArrowLeft,
  Trash2,
  Edit,
  Eye,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Copy,
  Tag as TagIcon,
  Sparkles,
  DollarSign,
  Package,
  Calendar,
  Layers,
  Settings,
  HelpCircle as HelpIcon,
  Download,
  Upload
} from "lucide-react";
import { ExcelExportDialog, type ExportScope } from "@/components/shared/ExcelExportDialog";
import { PRODUCT_EXPORT_GROUPS } from "@/lib/products/export-fields";
import { ImportExcelModal } from "@/components/imports/ImportExcelModal";
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { PageGuard } from "@/components/auth/PageGuard";

type ProductCandidate = {
  id: string;
  rowIds: string[];
  sku: string;
  retailName: string;
  inputProductName: string;
  adjustedInvoiceName: string;
  unit: string;
  purchasePrice: string;
  rowCount: number;
  missing: string[];
};

type ProductDraft = {
  sku: string;
  adjustedInvoiceName: string;
  retailName: string;
  unit: string;
  salePrice: string;
  imageUrl: string;
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

export default function ProductsPage() {
  const { store, setStore, productMeta, setProductMeta, setNotice, setError, confirmAction, refreshLookups } = useApp();
  const { hasPermission } = usePermissions();

  // Mode: list vs form view
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "candidates">("list");
  
  // Standard products state
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [categories, setCategories] = useState<any[]>([]);
  const [copiedSku, setCopiedSku] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>("all");
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  function copySku(sku: string) {
    navigator.clipboard.writeText(sku).then(() => {
      setCopiedSku(sku);
      setTimeout(() => setCopiedSku((cur) => (cur === sku ? null : cur)), 1500);
    });
  }

  // Filters for standard products
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Candidate editor states
  const [productEditMode, setProductEditMode] = useState(false);
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({});

  // Interactive Candidate Mapping Modal states
  const [selectedCandidate, setSelectedCandidate] = useState<ProductCandidate | null>(null);
  const [mappingOption, setMappingOption] = useState<"existing" | "new">("existing");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [modalProductSearch, setModalProductSearch] = useState("");
  const [imageEditor, setImageEditor] = useState<{ product: ProductCandidate; value: string } | null>(null);
  const [modalDraft, setModalDraft] = useState<ProductDraft>({
    sku: "",
    adjustedInvoiceName: "",
    retailName: "",
    unit: "",
    salePrice: "",
    imageUrl: ""
  });

  // Form states for Standard Product
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unit, setUnit] = useState("cái");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [compareAtPrice, setCompareAtPrice] = useState("0");
  const [costPrice, setCostPrice] = useState("0");
  const [taxable, setTaxable] = useState(true);
  
  const [location, setLocation] = useState("Cửa hàng chính");
  const [trackInventory, setTrackInventory] = useState(true);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [manageExpiry, setManageExpiry] = useState(false);
  const [expiryWarning, setExpiryWarning] = useState(true);
  const [expiryWarningDays, setExpiryWarningDays] = useState(1);

  const [requiresShipping, setRequiresShipping] = useState(true);
  const [weight, setWeight] = useState("0");
  const [weightUnit, setWeightUnit] = useState("g");

  const [attributeName, setAttributeName] = useState("");
  const [attributeValues, setAttributeValues] = useState<string[]>([]);
  const [attributeInput, setAttributeInput] = useState("");

  const [imageUrl, setImageUrl] = useState("");
  const [salesChannels, setSalesChannels] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [brandName, setBrandName] = useState("");
  const [productTypeName, setProductTypeName] = useState("");
  const [taxGroup, setTaxGroup] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [themeTemplate, setThemeTemplate] = useState("product");

  // Load products & categories
  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/categories")
      ]);
      if (prodRes.ok) {
        setProducts(await prodRes.json());
        setLoadError("");
      } else {
        setLoadError("Không tải được danh sách sản phẩm. Vui lòng thử lại.");
      }
      if (catRes.ok) setCategories(await catRes.json());
    } catch (err) {
      console.error(err);
      setLoadError("Không tải được danh sách sản phẩm. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Open the detail or edit form
  const openForm = (prod?: any, readOnly = false) => {
    if (prod) {
      setName(prod.name || "");
      setSku(prod.sku || "");
      setBarcode(prod.barcode || "");
      setUnit(prod.unit || "cái");
      setDescription(prod.description || "");
      setPrice(String(prod.price ?? 0));
      setCompareAtPrice(String(prod.compare_at_price ?? 0));
      setCostPrice(String(prod.cost_price ?? 0));
      setTaxable(!!prod.taxable);
      
      setTrackInventory(prod.track_inventory !== false);
      setAllowNegativeStock(!!prod.allow_negative_stock);
      setManageExpiry(!!prod.manage_expiry);
      
      setWeight(String(prod.weight ?? 0));
      setWeightUnit(prod.weight_unit || "g");
      
      setImageUrl(prod.image_url || "");
      setSalesChannels(prod.sales_channels || []);
      setCategoryId(prod.category_id || "");
      setBrandName(prod.brand_name || "");
      setProductTypeName(prod.type_name || "");
      setTags(prod.tags || []);
      setThemeTemplate(prod.theme_template || "product");

      setEditingProduct(prod);
      setIsReadOnly(readOnly);
    } else {
      // Clear form
      setName("");
      setSku("");
      setBarcode("");
      setUnit("cái");
      setDescription("");
      setPrice("0");
      setCompareAtPrice("0");
      setCostPrice("0");
      setTaxable(true);
      
      setTrackInventory(true);
      setAllowNegativeStock(false);
      setManageExpiry(false);
      
      setWeight("0");
      setWeightUnit("g");
      
      setImageUrl("");
      setSalesChannels([]);
      setCategoryId("");
      setBrandName("");
      setProductTypeName("");
      setTags([]);
      setThemeTemplate("product");

      setEditingProduct(null);
      setIsReadOnly(false);
    }
    setIsFormOpen(true);
  };

  // Filtered standard products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (p.sku ?? "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesChannel = channelFilter === "all" || (p.sales_channels ?? []).includes(channelFilter);
      const matchesCategory = categoryFilter === "all" || p.category_id === categoryFilter;
      return matchesSearch && matchesChannel && matchesCategory;
    });
  }, [products, searchQuery, channelFilter, categoryFilter]);

  // Reset về trang 1 khi bộ lọc thay đổi để không "kẹt" ở trang trống.
  useEffect(() => {
    setPage(1);
  }, [searchQuery, channelFilter, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = useMemo(
    () => filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredProducts, currentPage]
  );

  const handleExportSubmit = async (selection: { fields: string[]; scope: ExportScope }) => {
    setExporting(true);
    try {
      const rows = selection.scope === "all" ? filteredProducts : pagedProducts;
      const res = await fetch("/api/products/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, fields: selection.fields })
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `san-pham-${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Không xuất được file.");
    } finally {
      setExporting(false);
    }
  };
  const pageStart = filteredProducts.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, filteredProducts.length);

  // Candidate grouping from scanned rows
  const appliedDocumentIds = useMemo(
    () => new Set(store.documents.filter((document) => document.appliedToSummary).map((document) => document.id)),
    [store.documents]
  );

  const productCandidates = useMemo<ProductCandidate[]>(() => {
    const grouped = new Map<string, ProductCandidate>();

    for (const row of store.rows) {
      if (!appliedDocumentIds.has(row.documentId)) continue;

      const sku = cleanText(row.internalProductCode);
      const inputProductName = cleanText(row.inputProductName);
      const adjustedInvoiceName = cleanText(row.adjustedInvoiceName);
      const retailName = cleanText(row.retailName);
      const unit = cleanText(row.unit);
      const purchasePrice = cleanText(row.unitPrice);
      const key = sku ? `sku:${sku}` : `raw:${inputProductName.toLowerCase()}|${unit.toLowerCase()}`;
      const existing = grouped.get(key);
      const missing = [
        sku ? "" : "SKU",
        adjustedInvoiceName ? "" : "tên chỉnh lại",
        retailName ? "" : "tên bán lẻ"
      ].filter(Boolean);

      if (existing) {
        grouped.set(key, {
          ...existing,
          rowIds: [...existing.rowIds, row.id],
          sku: existing.sku || sku,
          inputProductName: existing.inputProductName || inputProductName,
          adjustedInvoiceName: existing.adjustedInvoiceName || adjustedInvoiceName,
          retailName: existing.retailName || retailName,
          unit: existing.unit || unit,
          purchasePrice: existing.purchasePrice || purchasePrice,
          rowCount: existing.rowCount + 1,
          missing: Array.from(new Set([...existing.missing, ...missing]))
        });
      } else {
        grouped.set(key, {
          id: key,
          rowIds: [row.id],
          sku,
          inputProductName,
          adjustedInvoiceName,
          retailName,
          unit,
          purchasePrice,
          rowCount: 1,
          missing
        });
      }
    }

    return Array.from(grouped.values()).sort((first, second) => {
      const firstReady = first.sku && first.adjustedInvoiceName && first.retailName ? 0 : 1;
      const secondReady = second.sku && second.adjustedInvoiceName && second.retailName ? 0 : 1;
      if (firstReady !== secondReady) return firstReady - secondReady;
      return (first.retailName || first.inputProductName).localeCompare(second.retailName || second.inputProductName, "vi", {
        sensitivity: "base"
      });
    });
  }, [appliedDocumentIds, store.rows]);

  const getProductDraft = (product: ProductCandidate): ProductDraft => {
    const meta = productMeta[product.id];
    return (
      productDrafts[product.id] ?? {
        sku: product.sku,
        adjustedInvoiceName: product.adjustedInvoiceName,
        retailName: product.retailName,
        unit: product.unit,
        salePrice: meta?.salePrice ?? "",
        imageUrl: meta?.imageUrl ?? ""
      }
    );
  };

  const updateProductDraft = (product: ProductCandidate, patch: Partial<ProductDraft>) => {
    setProductDrafts((current) => ({
      ...current,
      [product.id]: {
        ...getProductDraft(product),
        ...patch
      }
    }));
  };

  const saveRowPatch = async (rowId: string, patch: Partial<InvoiceRow>) => {
    const response = await fetch(`/api/rows/${rowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!response.ok) {
      throw new Error("Không lưu được dòng.");
    }
  };

  // Trigger Save Candidate Modal popup
  const handleOpenMappingModal = (candidate: ProductCandidate) => {
    const draft = getProductDraft(candidate);
    setSelectedCandidate(candidate);
    setMappingOption("existing");
    setSelectedProductId("");
    setModalProductSearch("");
    setModalDraft({
      sku: draft.sku || "",
      adjustedInvoiceName: draft.adjustedInvoiceName || candidate.adjustedInvoiceName || "",
      retailName: draft.retailName || candidate.retailName || "",
      unit: draft.unit || candidate.unit || "cái",
      salePrice: draft.salePrice || "",
      imageUrl: draft.imageUrl || ""
    });
  };

  // Perform Save mapping logic
  const handleConfirmMapping = async () => {
    if (!selectedCandidate) return;

    if (mappingOption === "existing") {
      if (!selectedProductId) {
        setError("Vui lòng chọn sản phẩm muốn liên kết.");
        return;
      }
      try {
        const res = await fetch("/api/products/map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: selectedProductId,
            rowIds: selectedCandidate.rowIds
          })
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Không thể liên kết và cập nhật tồn kho.");
        }

        setNotice("Đã liên kết sản phẩm và cập nhật tồn kho thành công.");
        setSelectedCandidate(null);
        await loadData();
        
        // Force refresh store rows mapping in memory
        setStore((current) => ({
          ...current,
          rows: current.rows.map((row) => {
            if (selectedCandidate.rowIds.includes(row.id)) {
              const prod = products.find((p) => p.id === selectedProductId);
              if (prod) {
                return normalizeFinancials({
                  ...row,
                  internalProductCode: prod.sku,
                  retailName: prod.name,
                  adjustedInvoiceName: prod.name,
                  unit: prod.unit
                });
              }
            }
            return row;
          })
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
      }
    } else {
      // Option 2: Save as new product candidate
      if (!modalDraft.sku.trim()) {
        setError("Vui lòng nhập mã SKU cho sản phẩm mới.");
        return;
      }
      if (!modalDraft.retailName.trim()) {
        setError("Vui lòng nhập tên bán lẻ cho sản phẩm mới.");
        return;
      }
      if (!modalDraft.adjustedInvoiceName.trim()) {
        setError("Vui lòng nhập tên chỉnh lại xuất hóa đơn.");
        return;
      }

      const patch: Partial<InvoiceRow> = {
        internalProductCode: modalDraft.sku.trim(),
        adjustedInvoiceName: modalDraft.adjustedInvoiceName.trim(),
        retailName: modalDraft.retailName.trim(),
        unit: modalDraft.unit.trim()
      };

      setStore((current) => ({
        ...current,
        rows: current.rows.map((row) => (selectedCandidate.rowIds.includes(row.id) ? normalizeFinancials({ ...row, ...patch }) : row))
      }));

      try {
        await Promise.all(selectedCandidate.rowIds.map((rowId) => saveRowPatch(rowId, patch)));
        const nextProductId = patch.internalProductCode ? `sku:${patch.internalProductCode}` : selectedCandidate.id;
        
        setProductMeta((current) => ({
          ...current,
          [selectedCandidate.id]: {
            salePrice: normalizeNumberText(modalDraft.salePrice),
            imageUrl: modalDraft.imageUrl.trim()
          },
          [nextProductId]: {
            salePrice: normalizeNumberText(modalDraft.salePrice),
            imageUrl: modalDraft.imageUrl.trim()
          }
        }));

        if (patch.internalProductCode) {
          await fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sku: patch.internalProductCode,
              inputProductName: selectedCandidate.inputProductName,
              adjustedInvoiceName: patch.adjustedInvoiceName ?? "",
              retailName: patch.retailName ?? "",
              unit: patch.unit ?? "",
              salePrice: normalizeNumberText(modalDraft.salePrice),
              imageUrl: modalDraft.imageUrl.trim()
            })
          }).catch(() => undefined);
        }

        setNotice(`Đã tạo sản phẩm mới "${modalDraft.retailName}" từ hóa đơn.`);
        setSelectedCandidate(null);
        await refreshLookups().catch(() => undefined);
        await loadData();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Có lỗi khi lưu thông tin sản phẩm.");
      }
    }
  };

  // Submit standard product form (creates or updates)
  const handleSaveProduct = async () => {
    if (!name.trim()) {
      setError("Tên sản phẩm là bắt buộc.");
      return;
    }

    const parsedPrice = parseFloat(price.replace(/,/g, "")) || 0;
    const parsedComparePrice = parseFloat(compareAtPrice.replace(/,/g, "")) || 0;
    const parsedCostPrice = parseFloat(costPrice.replace(/,/g, "")) || 0;
    const parsedWeight = parseFloat(weight) || 0;

    const payload = {
      name: name.trim(),
      sku: sku.trim() || undefined,
      barcode: barcode.trim() || undefined,
      unit: unit.trim() || undefined,
      description: description.trim() || undefined,
      price: parsedPrice,
      compare_at_price: parsedComparePrice,
      cost_price: parsedCostPrice,
      taxable,
      track_inventory: trackInventory,
      allow_negative_stock: allowNegativeStock,
      manage_expiry: manageExpiry,
      weight: parsedWeight,
      weight_unit: weightUnit,
      category_id: categoryId || null,
      brand_name: brandName.trim() || undefined,
      product_type_name: productTypeName.trim() || undefined,
      tags,
      sales_channels: salesChannels,
      theme_template: themeTemplate,
      status: "active",
      image_url: imageUrl.trim() || undefined
    };

    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : "/api/products";
      const method = editingProduct ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Không thể lưu sản phẩm.");
      }

      setNotice(editingProduct ? `Đã cập nhật sản phẩm "${name}" thành công.` : `Đã tạo sản phẩm "${name}" thành công.`);
      setIsFormOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
    }
  };

  // Delete product
  const handleDeleteProduct = async (id: string, prodName: string) => {
    const confirmed = await confirmAction({
      title: `Xóa sản phẩm "${prodName}"?`,
      description: "Sản phẩm sẽ bị xóa khỏi danh sách quản lý kho. Hành động này không xóa dữ liệu hóa đơn đã scan.",
      confirmLabel: "Xóa sản phẩm",
      tone: "danger"
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Không thể xóa sản phẩm.");
      setNotice(`Đã xóa sản phẩm "${prodName}" thành công.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi khi xóa sản phẩm.");
    }
  };

  const toggleChannel = (channel: string) => {
    if (isReadOnly) return;
    setSalesChannels((current) => 
      current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel]
    );
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const val = tagInput.trim();
      if (val && !tags.includes(val)) {
        setTags([...tags, val]);
        setTagInput("");
      }
    }
  };

  const handleAddAttribute = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const val = attributeInput.trim();
      if (val && !attributeValues.includes(val)) {
        setAttributeValues([...attributeValues, val]);
        setAttributeInput("");
      }
    }
  };

  // Form View (Creating/Editing/Viewing Detail)
  if (isFormOpen) {
    const isEditing = !!editingProduct;
    return (
      <div className="space-y-6">
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b bg-white -mx-6 -mt-6 p-4 px-6 shadow-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsFormOpen(false)}
              className="p-2 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
              title="Quay lại"
            >
              <ArrowLeft className="h-4 w-4 text-slate-600" />
            </button>
            <h1 className="text-xl font-bold text-slate-800">
              {isReadOnly ? "Chi tiết sản phẩm" : isEditing ? "Sửa sản phẩm" : "Thêm sản phẩm"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 border rounded-md text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {isReadOnly ? "Đóng" : "Hủy"}
            </button>
            {isReadOnly ? (
              <button 
                onClick={() => setIsReadOnly(false)}
                className="px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:opacity-90 transition-all shadow-sm flex items-center gap-1.5"
              >
                <Edit className="h-4 w-4" />
                Sửa sản phẩm
              </button>
            ) : (
              <button 
                onClick={handleSaveProduct}
                disabled={!name.trim()}
                className="px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {isEditing ? "Cập nhật" : "Thêm sản phẩm"}
              </button>
            )}
          </div>
        </div>

        {/* Content Form grid */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4 pb-16">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* General Info */}
            <section className="bg-white rounded-lg border p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">Thông tin sản phẩm</h2>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Tên sản phẩm <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <input 
                    type="text"
                    disabled={isReadOnly}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-slate-200/70 rounded-lg pl-10 pr-3 py-2.5 text-sm outline-none transition-all focus:ring-4 focus:ring-primary/10 focus:border-primary hover:border-primary/40 disabled:bg-slate-50 disabled:text-slate-600 shadow-sm"
                    placeholder="Nhập tên sản phẩm"
                  />
                  <span className="absolute left-3.5 top-2.5 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Mã SKU</label>
                  <input 
                    type="text"
                    disabled={isReadOnly}
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full border border-slate-200/70 rounded-lg px-3 py-2 text-sm outline-none transition-all focus:ring-4 focus:ring-primary/10 focus:border-primary hover:border-primary/40 disabled:bg-slate-50 disabled:text-slate-600 shadow-sm"
                    placeholder="Mã SKU định danh"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Mã vạch / Barcode</label>
                  <input 
                    type="text"
                    disabled={isReadOnly}
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    className="w-full border border-slate-200/70 rounded-lg px-3 py-2 text-sm outline-none transition-all focus:ring-4 focus:ring-primary/10 focus:border-primary hover:border-primary/40 disabled:bg-slate-50 shadow-sm"
                    placeholder="Mã vạch sản phẩm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Đơn vị tính</label>
                  <input 
                    type="text"
                    disabled={isReadOnly}
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full border border-slate-200/70 rounded-lg px-3 py-2 text-sm outline-none transition-all focus:ring-4 focus:ring-primary/10 focus:border-primary hover:border-primary/40 disabled:bg-slate-50 shadow-sm"
                    placeholder="Cái, hộp, chiếc..."
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Mô tả sản phẩm</label>
                <textarea 
                  disabled={isReadOnly}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="w-full border border-slate-200/70 rounded-lg px-3 py-2.5 text-sm outline-none transition-all focus:ring-4 focus:ring-primary/10 focus:border-primary hover:border-primary/40 disabled:bg-slate-50 shadow-sm"
                  placeholder="Nhập mô tả sản phẩm chi tiết..."
                />
              </div>
            </section>

            {/* Pricing */}
            <section className="bg-white rounded-lg border p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Thông tin giá</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Giá bán</label>
                  <div className="relative">
                    <input 
                      type="text"
                      disabled={isReadOnly}
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
                      className="w-full border border-slate-200/70 rounded-lg pl-3 pr-8 py-2 text-right text-sm outline-none transition-all focus:ring-4 focus:ring-primary/10 focus:border-primary hover:border-primary/40 disabled:bg-slate-50 font-bold shadow-sm"
                    />
                    <span className="absolute right-3 top-2 text-slate-400 text-xs">đ</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Giá so sánh</label>
                  <div className="relative">
                    <input 
                      type="text"
                      disabled={isReadOnly}
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value.replace(/[^\d]/g, ""))}
                      className="w-full border border-slate-200/70 rounded-lg pl-3 pr-8 py-2 text-right text-sm outline-none transition-all focus:ring-4 focus:ring-primary/10 focus:border-primary hover:border-primary/40 disabled:bg-slate-50 shadow-sm"
                    />
                    <span className="absolute right-3 top-2 text-slate-400 text-xs">đ</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Giá vốn</label>
                  <div className="relative">
                    <input 
                      type="text"
                      disabled={isReadOnly}
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value.replace(/[^\d]/g, ""))}
                      className="w-full border border-slate-200/70 rounded-lg pl-3 pr-8 py-2 text-right text-sm outline-none transition-all focus:ring-4 focus:ring-primary/10 focus:border-primary hover:border-primary/40 disabled:bg-slate-50 shadow-sm"
                    />
                    <span className="absolute right-3 top-2 text-slate-400 text-xs">đ</span>
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-2">
                <input 
                  type="checkbox"
                  disabled={isReadOnly}
                  checked={taxable}
                  onChange={(e) => setTaxable(e.target.checked)}
                  className="rounded text-primary focus:ring-primary disabled:opacity-50"
                />
                <span className="text-sm text-slate-600">Áp dụng thuế suất GTGT</span>
              </label>
            </section>

            {/* Warehouse Inventory */}
            <section className="bg-white rounded-lg border p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Thông tin kho</h2>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Kho hàng lưu trữ</label>
                <select 
                  disabled={isReadOnly}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary bg-white disabled:bg-slate-50"
                >
                  <option value="Cửa hàng chính">Cửa hàng chính (Kho trung tâm)</option>
                  <option value="Kho phụ">Kho phụ HCM</option>
                </select>
              </div>
              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    disabled={isReadOnly}
                    checked={trackInventory}
                    onChange={(e) => setTrackInventory(e.target.checked)}
                    className="rounded text-primary focus:ring-primary disabled:opacity-50" 
                  />
                  <span className="text-sm text-slate-600 font-medium">Quản lý số lượng tồn kho</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    disabled={isReadOnly}
                    checked={allowNegativeStock}
                    onChange={(e) => setAllowNegativeStock(e.target.checked)}
                    className="rounded text-primary focus:ring-primary disabled:opacity-50" 
                  />
                  <span className="text-sm text-slate-600 font-medium">Cho phép bán âm (khi hết hàng)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    disabled={isReadOnly}
                    checked={manageExpiry}
                    onChange={(e) => setManageExpiry(e.target.checked)}
                    className="rounded text-primary focus:ring-primary disabled:opacity-50" 
                  />
                  <span className="text-sm text-slate-600 font-medium">Quản lý sản phẩm theo Lô - Hạn sử dụng (HSD)</span>
                </label>
              </div>
              {manageExpiry && (
                <div className="bg-slate-50 border p-4 rounded-md space-y-3 pl-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      disabled={isReadOnly}
                      checked={expiryWarning}
                      onChange={(e) => setExpiryWarning(e.target.checked)}
                      className="rounded text-primary focus:ring-primary disabled:opacity-50" 
                    />
                    <span className="text-xs text-slate-600 font-medium">Cảnh báo trước khi sản phẩm hết hạn</span>
                  </label>
                  {expiryWarning && (
                    <div className="flex items-center gap-3 text-xs">
                      <span>Thời gian cảnh báo trước:</span>
                      <div className="flex border rounded overflow-hidden bg-white">
                        <input 
                          type="number"
                          disabled={isReadOnly}
                          value={expiryWarningDays}
                          onChange={(e) => setExpiryWarningDays(parseInt(e.target.value) || 1)}
                          className="w-16 border-none p-1.5 focus:ring-0 text-center disabled:bg-slate-50" 
                        />
                        <span className="bg-slate-100 px-3 py-1.5 border-l">Ngày</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Shipping */}
            <section className="bg-white rounded-lg border p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Vận chuyển</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  disabled={isReadOnly}
                  checked={requiresShipping}
                  onChange={(e) => setRequiresShipping(e.target.checked)}
                  className="rounded text-primary focus:ring-primary disabled:opacity-50" 
                />
                <span className="text-sm text-slate-600">Sản phẩm yêu cầu vận chuyển</span>
              </label>
              {requiresShipping && (
                <div className="w-1/2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Khối lượng sản phẩm</label>
                  <div className="flex border rounded-md overflow-hidden">
                    <input 
                      type="text"
                      disabled={isReadOnly}
                      value={weight}
                      onChange={(e) => setWeight(e.target.value.replace(/[^\d]/g, ""))}
                      className="flex-1 border-none px-3 py-2 text-sm outline-none focus:ring-0 disabled:bg-slate-50" 
                    />
                    <select 
                      disabled={isReadOnly}
                      value={weightUnit}
                      onChange={(e) => setWeightUnit(e.target.value)}
                      className="bg-slate-50 border-l px-2 text-xs outline-none focus:ring-0 border-none disabled:opacity-50"
                    >
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                    </select>
                  </div>
                </div>
              )}
            </section>

            {/* Attributes */}
            <section className="bg-white rounded-lg border p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Thuộc tính / Phiên bản</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Tên thuộc tính</label>
                  <input 
                    type="text"
                    disabled={isReadOnly}
                    value={attributeName}
                    onChange={(e) => setAttributeName(e.target.value)}
                    placeholder="Ví dụ: Kích thước, Màu sắc"
                    className="w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Giá trị thuộc tính (Ấn Enter)</label>
                  <div className="flex flex-wrap items-center gap-1.5 p-1 border rounded-md bg-white min-h-[38px] disabled:bg-slate-50">
                    {attributeValues.map((val) => (
                      <span key={val} className="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-xs font-medium">
                        {val}
                        {!isReadOnly && (
                          <button 
                            type="button" 
                            onClick={() => setAttributeValues(attributeValues.filter((v) => v !== val))}
                            className="ml-1 text-blue-400 hover:text-blue-600 font-bold"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    <input 
                      type="text"
                      disabled={isReadOnly}
                      value={attributeInput}
                      onChange={(e) => setAttributeInput(e.target.value)}
                      onKeyDown={handleAddAttribute}
                      placeholder={attributeValues.length === 0 ? "Nhập giá trị và nhấn Enter" : ""}
                      className="flex-1 border-none p-1 focus:ring-0 text-sm disabled:bg-slate-50"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* SEO Preview */}
            <section className="bg-white rounded-lg border p-5 shadow-sm space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Xem trước kết quả tìm kiếm</h2>
              <div className="rounded bg-slate-50 border p-4 text-xs space-y-1">
                <div className="text-blue-700 text-sm font-semibold hover:underline cursor-pointer">
                  {name || "Tên sản phẩm mẫu"}
                </div>
                <div className="text-emerald-700 text-[10px]">
                  https://website-cua-ban.vn/products/{sku || name ? (sku || name).toLowerCase().replace(/[^a-z0-9]+/g, "-") : ""}
                </div>
                <div className="text-slate-600 line-clamp-2">
                  {description || "Chưa có mô tả chi tiết sản phẩm."}
                </div>
              </div>
            </section>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Product Image */}
            <section className="bg-white rounded-lg border p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Ảnh sản phẩm</h2>
              <div className="border border-dashed rounded-lg p-6 flex flex-col items-center justify-center bg-slate-50 relative transition-all hover:bg-slate-100 hover:border-primary/50 group/upload cursor-pointer overflow-hidden">
                {imageUrl ? (
                  <div className="relative group w-full aspect-square rounded overflow-hidden border">
                    <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    {!isReadOnly && (
                      <button 
                        type="button" 
                        onClick={() => setImageUrl("")}
                        className="absolute inset-0 bg-black/55 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold"
                      >
                        Thay đổi ảnh
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <ImageIcon className="h-8 w-8 text-slate-400 mb-1" />
                    <span className="text-[10px] text-slate-500 text-center">Gán liên kết hình ảnh trực tiếp từ URL bên dưới hoặc bấm vào đây để chọn file ảnh (lưu dạng Base64 để test)</span>
                    {!isReadOnly && (
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setImageUrl(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Đường dẫn ảnh (URL)</label>
                <input 
                  type="url"
                  disabled={isReadOnly}
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full border rounded-md px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-50"
                />
              </div>
            </section>

            {/* Sales Channels */}
            <section className="bg-white rounded-lg border p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Kênh bán hàng</h2>
              <div className="space-y-2">
                {[
                  { key: "pos", label: "Cửa hàng bán lẻ (POS)" },
                  { key: "web", label: "Cửa hàng trực tuyến" },
                  { key: "shopee", label: "Shopee" },
                  { key: "lazada", label: "Lazada" },
                  { key: "tiki", label: "Tiki" },
                  { key: "tiktok", label: "TikTok Shop" }
                ].map((ch) => {
                  const active = salesChannels.includes(ch.key);
                  return (
                    <button
                      key={ch.key}
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => toggleChannel(ch.key)}
                      className={`w-full flex items-center justify-between border rounded-md px-3 py-1.5 text-xs transition-all ${
                        active 
                          ? "border-primary bg-primary/5 text-primary font-semibold"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      } disabled:opacity-80`}
                    >
                      <span>{ch.label}</span>
                      {active && <Check className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Categorization */}
            <section className="bg-white rounded-lg border p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Phân loại sản phẩm</h2>
              
              {/* Category selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Danh mục sản phẩm</label>
                <select 
                  disabled={isReadOnly}
                  value={categoryId} 
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full border rounded-md px-2 py-1.5 text-xs outline-none bg-white focus:ring-1 focus:ring-primary disabled:bg-slate-50"
                >
                  <option value="">Chọn danh mục sản phẩm</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Brand Name Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nhãn hiệu</label>
                <input 
                  type="text" 
                  disabled={isReadOnly}
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Nhập tên nhãn hiệu"
                  className="w-full border rounded-md px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-50"
                />
              </div>

              {/* Product Type Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Loại sản phẩm</label>
                <input 
                  type="text" 
                  disabled={isReadOnly}
                  value={productTypeName}
                  onChange={(e) => setProductTypeName(e.target.value)}
                  placeholder="Nhập loại sản phẩm"
                  className="w-full border rounded-md px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-50"
                />
              </div>

              {/* Tax group selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nhóm ngành tính thuế GTGT</label>
                <select 
                  disabled={isReadOnly}
                  value={taxGroup} 
                  onChange={(e) => setTaxGroup(e.target.value)}
                  className="w-full border rounded-md px-2 py-1.5 text-xs outline-none bg-white focus:ring-1 focus:ring-primary disabled:bg-slate-50"
                >
                  <option value="">Chọn nhóm ngành nghề</option>
                  <option value="trade">Hoạt động phân phối, cung cấp hàng hóa (1%)</option>
                  <option value="service">Dịch vụ, xây dựng không bao thầu nguyên vật liệu (5%)</option>
                </select>
              </div>

              {/* Tags Tag list */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tags sản phẩm</label>
                <div className="flex flex-wrap items-center gap-1 p-1 border rounded-md bg-white min-h-[34px] mb-1.5 disabled:bg-slate-50">
                  {tags.map((t) => (
                    <span key={t} className="inline-flex items-center bg-slate-100 border px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-600">
                      {t}
                      {!isReadOnly && (
                        <button type="button" onClick={() => setTags(tags.filter((tag) => tag !== t))} className="ml-1 text-slate-400 font-bold hover:text-red-500">×</button>
                      )}
                    </span>
                  ))}
                  <input 
                    type="text" 
                    disabled={isReadOnly}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder={tags.length === 0 && !isReadOnly ? "Tìm kiếm hoặc thêm mới" : ""}
                    className="flex-1 border-none p-0.5 focus:ring-0 text-xs disabled:bg-slate-50"
                  />
                </div>
              </div>
            </section>

            {/* Layout template */}
            <section className="bg-white rounded-lg border p-5 shadow-sm space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Khung giao diện</h2>
              <select 
                disabled={isReadOnly}
                value={themeTemplate}
                onChange={(e) => setThemeTemplate(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-xs outline-none bg-white focus:ring-1 focus:ring-primary disabled:bg-slate-50"
              >
                <option value="product">product (Mẫu chi tiết chuẩn)</option>
                <option value="gift">gift (Mẫu thẻ quà tặng)</option>
              </select>
            </section>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Page rendering
  return (
    <PageGuard permission="products.view">
    <section className="space-y-5">
      {/* Top Banner Action */}
      <div className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Vận hành</div>
            <h2 className="mt-1 text-2xl font-semibold">Sản phẩm / SKU</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Quản lý danh sách sản phẩm chuẩn kho và ánh xạ đồng bộ nhanh từ các hóa đơn quét được.
            </p>
          </div>
          <div className="flex gap-2">
            {hasPermission("products.import") ? (
              <button
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" />
                Nhập file
              </button>
            ) : null}
            {hasPermission("products.export") ? (
              <button
                onClick={() => setExportOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Xuất file
              </button>
            ) : null}
            {hasPermission("products.create") ? (
              <button
                onClick={() => openForm()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 shadow-soft"
              >
                <Plus className="h-4 w-4" />
                Thêm sản phẩm
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <ExcelExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="Xuất file danh sách sản phẩm"
        fieldPickerTitle="Tùy chọn trường hiển thị xuất file sản phẩm"
        groups={PRODUCT_EXPORT_GROUPS}
        scope={{
          value: exportScope,
          onChange: setExportScope,
          currentPageCount: pagedProducts.length,
          totalCount: filteredProducts.length
        }}
        onSubmit={handleExportSubmit}
        submitting={exporting}
      />

      {importOpen && (
        <ImportExcelModal
          title="Nhập file danh sách sản phẩm"
          templateUrl="/api/products/import/template"
          parseUrl="/api/products/import"
          commitUrl="/api/products/import"
          kind="products"
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            loadData();
          }}
        />
      )}

      {/* Tabs list switch */}
      <div className="panel overflow-hidden">
        {/* Navigation tabs */}
        <div className="border-b px-4 flex justify-between items-center bg-slate-50/20">
          <div className="flex">
            <button 
              onClick={() => setActiveTab("list")}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
                activeTab === "list" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Danh sách sản phẩm ({filteredProducts.length})
            </button>
            <button 
              onClick={() => setActiveTab("candidates")}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
                activeTab === "candidates" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Tạo nhanh từ hóa đơn ({productCandidates.length})
            </button>
          </div>
        </div>

        {activeTab === "list" ? (
          /* STANDARD PRODUCTS TABLE */
          <>
            {/* Filters search */}
            <div className="p-4 border-b flex flex-wrap items-center gap-3 bg-slate-50/50">
              <div className="relative flex-1 max-w-sm">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Search className="h-4 w-4" />
                </span>
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm theo mã SKU, tên sản phẩm..."
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-md text-sm outline-none bg-white focus:ring-1 focus:ring-primary"
                />
              </div>

              <select 
                value={categoryFilter} 
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">Tất cả danh mục</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>

              <select 
                value={channelFilter} 
                onChange={(e) => setChannelFilter(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">Kênh bán hàng</option>
                <option value="pos">Tại cửa hàng (POS)</option>
                <option value="web">Cửa hàng trực tuyến</option>
                <option value="shopee">Shopee</option>
                <option value="lazada">Lazada</option>
                <option value="tiki">Tiki</option>
                <option value="tiktok">TikTok Shop</option>
              </select>

              {(searchQuery || channelFilter !== "all" || categoryFilter !== "all") && (
                <button 
                  onClick={() => {
                    setSearchQuery("");
                    setChannelFilter("all");
                    setCategoryFilter("all");
                  }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Thiết lập lại bộ lọc
                </button>
              )}
            </div>

            {loadError ? (
              <div className="mx-6 mt-3 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                <span>{loadError}</span>
                <button onClick={loadData} className="shrink-0 font-semibold hover:underline">
                  Thử lại
                </button>
              </div>
            ) : null}

            {/* Table data grid */}
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center p-12 gap-2 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Đang tải danh sách sản phẩm...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center p-12 text-slate-500 space-y-2">
                  <p>Chưa có dữ liệu sản phẩm nào được tạo.</p>
                  <button 
                    onClick={() => openForm()}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Tạo mới sản phẩm đầu tiên
                  </button>
                </div>
              ) : (
                <table className="w-full border-collapse text-sm text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="w-12 px-6 py-3">
                        <input type="checkbox" className="rounded border-slate-300 text-primary focus:ring-primary" disabled />
                      </th>
                      <th className="px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">Sản phẩm</th>
                      <th className="px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs text-center">Tồn kho khả dụng</th>
                      <th className="px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs text-center">Đơn vị</th>
                      <th className="px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs text-center">Phân loại</th>
                      <th className="px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs text-right">Giá bán lẻ</th>
                      <th className="px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs text-right">Giá bán sĩ</th>
                      <th className="px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs text-right">Giá vốn</th>
                      <th className="w-28 px-6 py-3 text-center font-semibold text-slate-500 uppercase tracking-wider text-xs">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <input type="checkbox" className="rounded border-slate-300 text-primary focus:ring-primary" disabled />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-slate-100 border rounded flex items-center justify-center shrink-0 overflow-hidden">
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon className="h-5 w-5 text-slate-400" />
                              )}
                            </div>
                            <div>
                              <button 
                                onClick={() => openForm(p, true)}
                                className="font-semibold text-primary hover:underline cursor-pointer block text-left"
                              >
                                {p.name}
                              </button>
                              <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-mono">
                                SKU: {p.sku || "—"}
                                {p.sku && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copySku(p.sku);
                                    }}
                                    title="Sao chép mã SKU"
                                    className="text-slate-300 hover:text-primary"
                                  >
                                    {copiedSku === p.sku ? (
                                      <Check className="h-3 w-3 text-green-500" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="font-semibold text-slate-800">{p.total_inventory ?? 0}</div>
                          <div className="text-[10px] text-slate-400">({p.variant_count ?? 1} phiên bản)</div>
                        </td>
                        <td className="px-6 py-4 text-center text-slate-500">
                          {p.unit || "cái"}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="text-xs font-semibold text-slate-700">{p.category_name || "—"}</div>
                          {p.brand_name && <div className="text-[10px] text-slate-400 mt-0.5">{p.brand_name}</div>}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-slate-700 tabular-nums">
                          {formatCurrencyVND(Number(p.price) || 0)}
                        </td>
                        <td className="px-6 py-4 text-right text-slate-600 tabular-nums">
                          {formatCurrencyVND(Number(p.compare_at_price) || 0)}
                        </td>
                        <td className="px-6 py-4 text-right text-slate-600 tabular-nums">
                          {formatCurrencyVND(Number(p.cost_price) || 0)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openForm(p, true)}
                              className="rounded p-1.5 text-slate-600 hover:bg-slate-100 transition-colors"
                              title="Xem chi tiết"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {hasPermission("products.edit") ? (
                              <button
                                onClick={() => openForm(p, false)}
                                className="rounded p-1.5 text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Sửa sản phẩm"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                            ) : null}
                            {hasPermission("products.delete") ? (
                              <button
                                onClick={() => handleDeleteProduct(p.id, p.name)}
                                className="rounded p-1.5 text-red-600 hover:bg-red-50 transition-colors"
                                title="Xóa sản phẩm"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination footer */}
            <div className="px-6 py-4 border-t flex items-center justify-between text-xs text-slate-500 bg-slate-50/20">
              <div>
                Từ {pageStart} đến {pageEnd} trên tổng {filteredProducts.length} kết quả
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="w-7 h-7 flex items-center justify-center rounded border bg-white enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2 font-semibold text-slate-600">
                  Trang {currentPage}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="w-7 h-7 flex items-center justify-center rounded border bg-white enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* QUICK SCAN CANDIDATES MAPPING */
          <>
            <div className="p-4 border-b bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                {productEditMode
                  ? "Nhập các trường thông tin bổ sung rồi nhấn Lưu để hoàn thành liên kết sản phẩm."
                  : "Các gợi ý sản phẩm tự động lọc từ hóa đơn scan của bạn. Bấm Hoàn thiện dữ liệu để bắt đầu cập nhật."}
              </div>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  productEditMode ? "border bg-white hover:bg-slate-50" : "bg-primary text-white hover:opacity-90"
                }`}
                onClick={() => setProductEditMode((val) => !val)}
              >
                {productEditMode ? "Xem danh sách" : "Hoàn thiện dữ liệu"}
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm text-left min-w-[1200px]">
                <thead>
                  <tr className="bg-slate-50 border-b">
                    <th className="px-3 py-3 font-semibold text-slate-500 text-xs uppercase">Trạng thái</th>
                    <th className="px-3 py-3 font-semibold text-slate-500 text-xs uppercase">SKU</th>
                    <th className="px-3 py-3 font-semibold text-slate-500 text-xs uppercase">Tên bán lẻ</th>
                    <th className="px-3 py-3 font-semibold text-slate-500 text-xs uppercase">Tên chỉnh xuất HĐ</th>
                    <th className="px-3 py-3 font-semibold text-slate-500 text-xs uppercase">Tên hàng đầu vào</th>
                    <th className="px-3 py-3 font-semibold text-slate-500 text-xs uppercase">ĐVT</th>
                    <th className="px-3 py-3 font-semibold text-slate-500 text-xs uppercase text-right">Giá nhập</th>
                    <th className="px-3 py-3 font-semibold text-slate-500 text-xs uppercase text-right">Giá bán</th>
                    <th className="px-3 py-3 font-semibold text-slate-500 text-xs uppercase text-center">Ảnh</th>
                    <th className="px-3 py-3 font-semibold text-slate-500 text-xs uppercase text-center w-20">Lưu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productCandidates.slice(0, 100).map((product) => {
                    const draft = getProductDraft(product);
                    return (
                      <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            product.missing.length === 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                            {product.missing.length === 0 ? "Sẵn sàng" : `Thiếu ${product.missing.join(", ")}`}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {productEditMode ? (
                            <input 
                              className="border rounded px-2 py-1 text-xs w-full focus:ring-1 focus:ring-primary outline-none" 
                              value={draft.sku} 
                              onChange={(e) => updateProductDraft(product, { sku: e.target.value })} 
                              placeholder="Mã SKU" 
                            />
                          ) : (
                            product.sku || <span className="text-amber-600 font-medium">Cần nhập</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {productEditMode ? (
                            <input 
                              className="border rounded px-2 py-1 text-xs w-full focus:ring-1 focus:ring-primary outline-none" 
                              value={draft.retailName} 
                              onChange={(e) => updateProductDraft(product, { retailName: e.target.value })} 
                              placeholder="Tên bán lẻ" 
                            />
                          ) : (
                            product.retailName || <span className="text-slate-400 italic">Chưa có</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {productEditMode ? (
                            <input 
                              className="border rounded px-2 py-1 text-xs w-full focus:ring-1 focus:ring-primary outline-none" 
                              value={draft.adjustedInvoiceName} 
                              onChange={(e) => updateProductDraft(product, { adjustedInvoiceName: e.target.value })} 
                              placeholder="Tên hóa đơn" 
                            />
                          ) : (
                            product.adjustedInvoiceName || <span className="text-slate-400 italic">Chưa có</span>
                          )}
                        </td>
                        <td className="max-w-[240px] truncate px-3 py-3 text-slate-600" title={cleanInvoiceProductName(product.inputProductName)}>
                          {cleanInvoiceProductName(product.inputProductName) || "-"}
                        </td>
                        <td className="px-3 py-3">
                          {productEditMode ? (
                            <input 
                              className="border rounded px-2 py-1 text-xs w-20 focus:ring-1 focus:ring-primary outline-none" 
                              value={draft.unit} 
                              onChange={(e) => updateProductDraft(product, { unit: e.target.value })} 
                              placeholder="ĐVT" 
                            />
                          ) : (
                            product.unit || "-"
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">
                          {product.purchasePrice ? formatCurrencyVND(parseNumeric(product.purchasePrice) ?? 0) : "-"}
                        </td>
                        <td className="px-3 py-3">
                          {productEditMode ? (
                            <input 
                              className="border rounded px-2 py-1 text-xs w-24 text-right focus:ring-1 focus:ring-primary outline-none" 
                              value={draft.salePrice} 
                              onChange={(e) => updateProductDraft(product, { salePrice: e.target.value.replace(/[^\d]/g, "") })} 
                              placeholder="Giá bán" 
                            />
                          ) : (
                            productMeta[product.id]?.salePrice ? formatCurrencyVND(parseNumeric(productMeta[product.id]?.salePrice) ?? 0) : <span className="text-slate-400 italic">Chưa có</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button 
                            type="button" 
                            className="text-xs text-primary hover:underline font-semibold"
                            onClick={() => setImageEditor({ product, value: draft.imageUrl })}
                          >
                            {draft.imageUrl ? "Sửa / xem" : "Thêm / xem"}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button 
                            type="button" 
                            className="bg-primary text-white px-3 py-1 rounded text-xs hover:opacity-90 font-medium shadow-sm"
                            onClick={() => handleOpenMappingModal(product)}
                          >
                            Lưu
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {productCandidates.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-12 text-center text-slate-400">
                        Chưa quét được dữ liệu hóa đơn nào để lập danh sách gợi ý.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {imageEditor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Ảnh sản phẩm</h3>
                <p className="mt-1 text-xs text-slate-500">Dán link ảnh để xem trước và lưu cùng dữ liệu sản phẩm.</p>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setImageEditor(null)}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 p-5">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Link ảnh</span>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  value={imageEditor.value}
                  onChange={(event) => setImageEditor({ ...imageEditor, value: event.target.value })}
                  placeholder="https://..."
                />
              </label>
              <div className="grid min-h-[180px] place-items-center overflow-hidden rounded-lg border bg-slate-50">
                {imageEditor.value.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageEditor.value.trim()}
                    alt="Xem trước ảnh sản phẩm"
                    className="max-h-[280px] max-w-full object-contain"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="text-sm text-slate-500">Chưa có link ảnh để xem trước.</div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-5 py-4">
              <button
                type="button"
                className="rounded-md border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setImageEditor(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                onClick={() => {
                  updateProductDraft(imageEditor.product, { imageUrl: imageEditor.value.trim() });
                  setImageEditor(null);
                }}
              >
                Lưu ảnh
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Save Candidate Mapping Modal Dialog */}
      {selectedCandidate && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                Lưu sản phẩm quét từ hóa đơn
              </h3>
              <button 
                type="button" 
                onClick={() => setSelectedCandidate(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded border border-slate-150 text-xs text-slate-600 space-y-1">
                <div><strong>Tên hàng đầu vào:</strong> {cleanInvoiceProductName(selectedCandidate.inputProductName)}</div>
                <div><strong>Giá nhập gần nhất:</strong> {selectedCandidate.purchasePrice ? formatCurrencyVND(parseNumeric(selectedCandidate.purchasePrice) ?? 0) : "-"}</div>
                <div><strong>Số lượng quét được:</strong> {selectedCandidate.rowCount} dòng hóa đơn</div>
              </div>

              {/* Option selection */}
              <div className="space-y-2.5">
                <div className="font-semibold text-xs text-slate-500 uppercase tracking-wider">Lựa chọn lưu trữ:</div>
                
                {/* Option 1: Existing Product */}
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50/50 transition-colors">
                  <input 
                    type="radio" 
                    name="mappingOption" 
                    checked={mappingOption === "existing"}
                    onChange={() => setMappingOption("existing")}
                    className="mt-0.5 text-primary focus:ring-primary" 
                  />
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-800">Đã có trong danh sách sản phẩm</span>
                    <p className="text-[11px] text-slate-500">Liên kết và cộng dồn số lượng tồn kho khả dụng từ hóa đơn vào sản phẩm này.</p>
                  </div>
                </label>

                {/* Option 2: New Product */}
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50/50 transition-colors">
                  <input 
                    type="radio" 
                    name="mappingOption" 
                    checked={mappingOption === "new"}
                    onChange={() => setMappingOption("new")}
                    className="mt-0.5 text-primary focus:ring-primary" 
                  />
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-800">Chưa có trong danh sách sản phẩm</span>
                    <p className="text-[11px] text-slate-500">Tạo một sản phẩm hoàn toàn mới trong hệ thống dựa trên thông tin hóa đơn.</p>
                  </div>
                </label>
              </div>

              {/* Option 1: Selected Product Dropdown */}
              {mappingOption === "existing" && (
                <div className="space-y-2 border-t pt-3.5">
                  <label className="block text-xs font-semibold text-slate-700">Chọn sản phẩm mục tiêu:</label>
                  
                  {/* Search box within modal list */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Tìm sản phẩm bằng tên hoặc SKU..."
                      value={modalProductSearch}
                      onChange={(e) => setModalProductSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-primary bg-white"
                    />
                  </div>

                  <select 
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-xs outline-none bg-white focus:ring-1 focus:ring-primary"
                  >
                    <option value="">-- Chọn sản phẩm có sẵn --</option>
                    {products
                      .filter((p) => 
                        p.name.toLowerCase().includes(modalProductSearch.toLowerCase()) ||
                        (p.sku ?? "").toLowerCase().includes(modalProductSearch.toLowerCase())
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.sku ? `(SKU: ${p.sku})` : ""}
                        </option>
                      ))
                    }
                  </select>
                </div>
              )}

              {/* Option 2: New product information & fields */}
              {mappingOption === "new" && (
                <div className="space-y-3 border-t pt-3.5">
                  <div className="text-xs font-bold text-slate-700">Kiểm tra thông tin & Nhập các trường còn thiếu:</div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">
                        Mã SKU <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        value={modalDraft.sku}
                        onChange={(e) => setModalDraft({ ...modalDraft, sku: e.target.value })}
                        placeholder="Nhập mã SKU"
                        className="w-full border rounded px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">
                        Đơn vị tính <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        value={modalDraft.unit}
                        onChange={(e) => setModalDraft({ ...modalDraft, unit: e.target.value })}
                        placeholder="cái, hộp, chiếc..."
                        className="w-full border rounded px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">
                      Tên bán lẻ hiển thị hệ thống <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={modalDraft.retailName}
                      onChange={(e) => setModalDraft({ ...modalDraft, retailName: e.target.value })}
                      placeholder="Nhập tên bán lẻ tại Sapo"
                      className="w-full border rounded px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">
                      Tên chỉnh lại xuất hóa đơn <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={modalDraft.adjustedInvoiceName}
                      onChange={(e) => setModalDraft({ ...modalDraft, adjustedInvoiceName: e.target.value })}
                      placeholder="Nhập tên xuất hóa đơn rút gọn"
                      className="w-full border rounded px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Giá bán lẻ (đ)</label>
                      <input 
                        type="text" 
                        value={modalDraft.salePrice}
                        onChange={(e) => setModalDraft({ ...modalDraft, salePrice: e.target.value.replace(/[^\d]/g, "") })}
                        placeholder="Nhập giá bán lẻ"
                        className="w-full border rounded px-2.5 py-1.5 text-xs text-right outline-none focus:ring-1 focus:ring-primary bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Đường dẫn ảnh (URL)</label>
                      <input 
                        type="url" 
                        value={modalDraft.imageUrl}
                        onChange={(e) => setModalDraft({ ...modalDraft, imageUrl: e.target.value })}
                        placeholder="https://..."
                        className="w-full border rounded px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 border-t bg-slate-50 flex items-center justify-end gap-2">
              <button 
                type="button"
                onClick={() => setSelectedCandidate(null)}
                className="px-4 py-1.5 text-xs border rounded-md text-slate-600 hover:bg-white transition-colors"
              >
                Hủy
              </button>
              <button 
                type="button"
                onClick={handleConfirmMapping}
                disabled={
                  mappingOption === "existing" 
                    ? !selectedProductId 
                    : (!modalDraft.sku.trim() || !modalDraft.retailName.trim() || !modalDraft.adjustedInvoiceName.trim())
                }
                className="px-4 py-1.5 text-xs bg-primary text-white rounded-md font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-center text-xs text-slate-400">
        Tìm hiểu thêm về{" "}
        <a href="#" className="text-primary hover:underline inline-flex items-center gap-0.5">
          quản lý sản phẩm sapo <HelpIcon className="h-3 w-3" />
        </a>
      </div>
    </section>
    </PageGuard>
  );
}
