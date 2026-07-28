"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ImageIcon, Loader2, Package, Printer, Search, Settings, SlidersHorizontal } from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";
import { zaloAuthApi } from "@/lib/zalo-api";
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { PageGuard } from "@/components/auth/PageGuard";

type InventoryProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  status: string;
  created_at: string;
  price: number;
  cost_price: number;
  wholesale_price: number;
  total_inventory: number;
  available_quantity: number;
  image_url: string;
  category_name: string;
  brand_name: string;
  type_name: string;
};

function fmtNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value || 0);
}

function fmtDate(value: string) {
  if (!value) return "---";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export default function ProductInventoryPage() {
  const { hasPermission } = usePermissions();
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editError, setEditError] = useState("");
  const staffNameRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/inventory/products", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không tải được dữ liệu tồn kho.");
        if (!cancelled) setProducts(data.products || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Không tải được dữ liệu tồn kho.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    zaloAuthApi
      .me()
      .then((res) => {
        staffNameRef.current = res.staff?.full_name || "";
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function startEditStock(product: InventoryProduct) {
    setEditingId(product.id);
    setEditingValue(String(Math.round(product.total_inventory)));
  }

  function cancelEditStock() {
    setEditingId(null);
    setEditingValue("");
  }

  async function commitEditStock(product: InventoryProduct) {
    const nextStock = Number(editingValue);
    if (!Number.isFinite(nextStock) || nextStock < 0) {
      setEditError("Số lượng tồn kho không hợp lệ.");
      return;
    }
    if (Math.round(nextStock) === Math.round(product.total_inventory)) {
      cancelEditStock();
      return;
    }
    setSavingId(product.id);
    setEditError("");
    try {
      const response = await fetch(`/api/inventory/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock: Math.round(nextStock), staff: staffNameRef.current }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không cập nhật được tồn kho.");
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, total_inventory: nextStock, available_quantity: nextStock } : p
        )
      );
      cancelEditStock();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Không cập nhật được tồn kho.");
    } finally {
      setSavingId(null);
    }
  }

  const productTypes = useMemo(() => Array.from(new Set(products.map((p) => p.type_name).filter(Boolean))), [products]);
  const brands = useMemo(() => Array.from(new Set(products.map((p) => p.brand_name).filter(Boolean))), [products]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return products.filter((product) => {
      const text = `${product.name} ${product.sku} ${product.barcode}`.toLowerCase();
      const matchesQuery = !keyword || text.includes(keyword);
      const matchesType = typeFilter === "all" || product.type_name === typeFilter;
      const matchesBrand = brandFilter === "all" || product.brand_name === brandFilter;
      const matchesStatus = statusFilter === "all" || product.status === statusFilter;
      return matchesQuery && matchesType && matchesBrand && matchesStatus;
    });
  }, [products, query, typeFilter, brandFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleProducts = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const from = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [query, typeFilter, brandFilter, statusFilter, pageSize]);

  return (
    <PageGuard permission="inventory.view">
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-9 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50" type="button">
            <Printer className="h-4 w-4" />
            In tem mã
          </button>
          <Link className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50" href="/products/categories">
            Loại sản phẩm
          </Link>
          <button className="h-9 rounded-md border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50" type="button">Combo</button>
          <button className="h-9 rounded-md border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50" type="button">Sản phẩm quy đổi</button>
        </div>
        <Link className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:opacity-90" href="/products">
          Xem danh sách sản phẩm
        </Link>
      </div>

      {editError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{editError}</div>
      )}

      <div className="overflow-hidden rounded-lg border bg-white shadow-soft">
        <div className="border-b">
          <div className="inline-flex border-b-2 border-primary px-6 py-3 text-sm font-semibold text-primary">
            Tất cả phiên bản sản phẩm
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-full rounded-md border bg-white pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="Tìm theo mã sản phẩm, tên sản phẩm, barcode"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select className="h-10 rounded-md border bg-white px-3 text-sm text-slate-600" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">Loại sản phẩm</option>
            {productTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select className="h-10 rounded-md border bg-white px-3 text-sm text-slate-600" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
            <option value="all">Nhãn hiệu</option>
            {brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
          </select>
          <select className="h-10 rounded-md border bg-white px-3 text-sm text-slate-600" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Trạng thái</option>
            <option value="active">Đang giao dịch</option>
            <option value="inactive">Ngừng giao dịch</option>
            <option value="draft">Nháp</option>
          </select>
          <button className="h-10 rounded-md border border-slate-200 bg-slate-100 px-3 text-sm text-slate-400" disabled type="button">Lưu bộ lọc</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] divide-y text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3 text-left"><input className="rounded border-slate-300 text-primary" type="checkbox" /></th>
                <th className="w-12 px-4 py-3 text-left"><Settings className="h-4 w-4" /></th>
                <th className="px-4 py-3 text-left">Ảnh</th>
                <th className="px-4 py-3 text-left">Tên phiên bản sản phẩm</th>
                <th className="px-4 py-3 text-center">Có thể bán</th>
                <th className="px-4 py-3 text-center">Tồn kho</th>
                <th className="px-4 py-3 text-center">Ngày khởi tạo</th>
                <th className="px-4 py-3 text-right">Giá bán lẻ</th>
                <th className="px-4 py-3 text-right">Giá nhập</th>
                <th className="px-4 py-3 text-right">Giá bán sĩ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-14 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Đang tải tồn kho...</td></tr>
              ) : error ? (
                <tr><td colSpan={10} className="px-4 py-14 text-center text-red-600">{error}</td></tr>
              ) : visibleProducts.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-14 text-center text-slate-500">Không có sản phẩm phù hợp.</td></tr>
              ) : visibleProducts.map((product) => (
                <tr key={product.id} className="transition-colors hover:bg-blue-50/70">
                  <td className="px-4 py-3"><input className="rounded border-slate-300 text-primary" type="checkbox" /></td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3">
                    <div className="grid h-10 w-10 place-items-center overflow-hidden rounded border bg-slate-50 text-slate-400">
                      {product.image_url ? <img alt={product.name} className="h-full w-full object-cover" src={product.image_url} /> : <ImageIcon className="h-4 w-4" />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link className="font-semibold text-primary hover:underline" href={`/products/inventory/${product.id}`}>{product.name}</Link>
                    <div className="text-xs text-slate-500">{product.sku || "---"}</div>
                  </td>
                  <td className={`px-4 py-3 text-center ${product.available_quantity < 0 ? "text-red-500" : product.available_quantity > 0 ? "text-emerald-600" : ""}`}>{fmtNumber(product.available_quantity)}</td>
                  <td className="px-4 py-3 text-center font-medium">
                    {editingId === product.id ? (
                      <input
                        autoFocus
                        type="number"
                        min={0}
                        className="h-8 w-24 rounded-md border border-primary px-2 text-center text-sm outline-none focus:ring-2 focus:ring-primary/15"
                        value={editingValue}
                        disabled={savingId === product.id}
                        onChange={(event) => setEditingValue(event.target.value)}
                        onBlur={() => commitEditStock(product)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          } else if (event.key === "Escape") {
                            cancelEditStock();
                          }
                        }}
                      />
                    ) : hasPermission("inventory.edit") ? (
                      <button
                        type="button"
                        title="Bấm để sửa tồn kho"
                        className="inline-flex min-w-[3rem] items-center justify-center rounded-md border border-transparent px-2 py-1 hover:border-slate-300 hover:bg-slate-50"
                        onClick={() => startEditStock(product)}
                      >
                        {savingId === product.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        ) : (
                          fmtNumber(product.total_inventory)
                        )}
                      </button>
                    ) : (
                      <span className="inline-flex min-w-[3rem] items-center justify-center px-2 py-1">
                        {fmtNumber(product.total_inventory)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">{fmtDate(product.created_at)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrencyVND(product.price)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrencyVND(product.cost_price)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrencyVND(product.wholesale_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-4 border-t px-4 py-4 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span>Hiển thị</span>
            <select className="rounded-md border px-2 py-1 text-xs" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>kết quả</span>
            <span className="ml-2">Từ {from} đến {to} trên tổng {filtered.length}</span>
          </div>
          <div className="flex items-center gap-1">
            <button className="grid h-8 w-8 place-items-center rounded-md border text-slate-500 disabled:text-slate-300" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button"><ChevronLeft className="h-4 w-4" /></button>
            {Array.from({ length: Math.min(pageCount, 6) }, (_, index) => index + 1).map((pageNumber) => (
              <button key={pageNumber} className={`grid h-8 w-8 place-items-center rounded-md text-sm ${currentPage === pageNumber ? "bg-primary text-white" : "border border-transparent hover:border-slate-300 hover:bg-slate-50"}`} onClick={() => setPage(pageNumber)} type="button">{pageNumber}</button>
            ))}
            <button className="grid h-8 w-8 place-items-center rounded-md border text-slate-500 disabled:text-slate-300" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} type="button"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <div className="flex justify-center py-5 text-sm text-slate-500">
        <div className="inline-flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Package className="h-5 w-5" /></span>
          <span>Bạn có thể xem thêm hướng dẫn về quản lý kho <a className="text-primary hover:underline" href="#">Tại đây</a></span>
        </div>
      </div>
    </section>
    </PageGuard>
  );
}
