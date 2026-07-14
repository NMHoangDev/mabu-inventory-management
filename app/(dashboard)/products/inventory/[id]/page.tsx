"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Copy, HelpCircle, ImageIcon, Info, Loader2, MessageCircle, Trash2 } from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";

type InventoryProductDetail = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  status: string;
  created_at: string;
  updated_at: string;
  price: number;
  cost_price: number;
  wholesale_price: number;
  total_inventory: number;
  available_quantity: number;
  category_name: string;
  brand_name: string;
  type_name: string;
  description: string;
  tax_group: string;
  tags: string[];
  taxable: boolean;
  track_inventory: boolean;
  weight: number;
  weight_unit: string;
  images: string[];
  locations: Array<{
    id: string;
    name: string;
    quantity: number;
    quantity_on_hold: number;
    available_quantity: number;
    cost_price: number;
    incoming_quantity: number;
    delivering_quantity: number;
    min_stock: number | null;
    max_stock: number | null;
    storage_location: string;
  }>;
};

function fmtNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value || 0);
}

function fmtDateTime(value: string) {
  if (!value) return "---";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function InfoIcon() {
  return <Info className="ml-1 inline h-3.5 w-3.5 text-blue-400" />;
}

export default function InventoryProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<InventoryProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/inventory/products/${params.id}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không tải được chi tiết sản phẩm.");
        if (!cancelled) setProduct(data.product);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Không tải được chi tiết sản phẩm.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (params.id) load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loading) {
    return <div className="grid min-h-[420px] place-items-center rounded-lg border bg-white text-slate-500"><div><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />Đang tải chi tiết sản phẩm...</div></div>;
  }

  if (error || !product) {
    return <div className="rounded-lg border bg-white p-8 text-center text-red-600">{error || "Không tìm thấy sản phẩm."}</div>;
  }

  // Chỉ hiển thị ảnh thật; nếu chưa có ảnh thì hiện 1 ô placeholder (không nhân
  // đôi cùng 1 ảnh như trước).
  const galleryImages = product.images.length ? product.images.slice(0, 4) : [""];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3 shadow-soft">
        <Link className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-primary" href="/products/inventory">
          <ArrowLeft className="h-4 w-4" />
          Quay lại quản lý kho
        </Link>
        <div className="flex gap-3">
          <button className="h-9 rounded-md border border-primary px-6 text-sm font-semibold text-primary hover:bg-blue-50" onClick={() => router.back()} type="button">Thoát</button>
          <Link className="inline-flex h-9 items-center rounded-md bg-primary px-5 text-sm font-semibold text-white hover:opacity-90" href="/products">Sửa sản phẩm</Link>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate-800">{product.name}</h2>
      </div>

      <section className="overflow-hidden rounded-lg border bg-white shadow-soft">
        <div className="flex items-center border-b px-4 py-3">
          <h3 className="font-bold text-slate-800">Thông tin sản phẩm</h3>
          <span className={`ml-3 rounded-full px-2 py-0.5 text-xs font-medium ${product.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{product.status === "active" ? "Đang giao dịch" : "Ngừng giao dịch"}</span>
        </div>
        <div className="grid grid-cols-1 gap-8 p-6 md:grid-cols-3">
          <div className="space-y-3 text-sm">
            <div className="flex"><span className="w-28 text-slate-500">Mã SKU</span><span className="text-slate-900">: {product.sku || "---"}</span></div>
            <div className="flex"><span className="w-28 text-slate-500">Mã barcode</span><span className="text-slate-900">: {product.barcode || "---"}</span></div>
            <div className="flex"><span className="w-28 text-slate-500">Khối lượng</span><span className="text-slate-900">: {product.weight ? `${fmtNumber(product.weight)}${product.weight_unit}` : "---"}</span></div>
            <div className="flex"><span className="w-28 text-slate-500">Đơn vị tính</span><span className="text-slate-900">: {product.unit || "---"}</span></div>
            <div className="flex"><span className="w-28 text-slate-500">Phân loại</span><span className="text-slate-900">: {product.type_name || "Sản phẩm thường"}</span></div>
            <div className="pt-1"><a className="text-primary hover:underline" href="#">Xem mô tả</a></div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex"><span className="w-36 text-slate-500">Loại sản phẩm</span><span className="text-slate-900">: {product.category_name || "---"}</span></div>
            <div className="flex"><span className="w-36 text-slate-500">Nhãn hiệu</span><span className="text-slate-900">: {product.brand_name || "---"}</span></div>
            <div className="flex"><span className="w-36 leading-tight text-slate-500">Nhóm ngành nghề tính thuế GTGT, TNCN</span><span className="text-slate-900">: {product.tax_group || "---"}</span></div>
            <div className="flex"><span className="w-36 text-slate-500">Tags</span><span className="text-slate-900">: {product.tags.length ? product.tags.join(", ") : "---"}</span></div>
            <div className="flex"><span className="w-36 text-slate-500">Ngày tạo</span><span className="text-slate-900">: {fmtDateTime(product.created_at)}</span></div>
            <div className="flex"><span className="w-36 text-slate-500">Ngày cập nhật cuối</span><span className="text-slate-900">: {fmtDateTime(product.updated_at)}</span></div>
          </div>
          <div className="flex flex-wrap gap-4">
            {galleryImages.map((image, index) => (
              <div key={index} className="grid h-24 w-24 place-items-center overflow-hidden rounded-md border bg-slate-50 p-1 text-slate-400">
                {image ? <img alt={`${product.name} ${index + 1}`} className="h-full w-full object-cover" src={image} /> : <ImageIcon className="h-7 w-7" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-lg border bg-white shadow-soft lg:col-span-2">
          <div className="border-b px-4 py-3 font-bold text-slate-800">Giá sản phẩm</div>
          <div className="grid grid-cols-1 gap-y-4 p-6 text-sm sm:grid-cols-2">
            <div className="flex"><span className="w-32 text-slate-500">Giá bán lẻ</span><span className="font-medium text-slate-900">: {formatCurrencyVND(product.price)}</span></div>
            <div className="flex"><span className="w-32 text-slate-500">Giá bán sỉ</span><span className="font-medium text-slate-900">: {formatCurrencyVND(product.wholesale_price)}</span></div>
            <div className="flex"><span className="w-32 text-slate-500">Giá nhập</span><span className="font-medium text-slate-900">: {formatCurrencyVND(product.cost_price)}</span></div>
          </div>
        </section>

        <section className="relative overflow-visible rounded-lg border bg-white shadow-soft">
          <div className="border-b px-4 py-3 font-bold text-slate-800">Thông tin thêm</div>
          <div className="space-y-4 p-6">
            <label className="flex items-center text-sm text-slate-700"><input checked={product.status === "active"} className="mr-2 h-4 w-4 rounded border-slate-300 text-primary" disabled type="checkbox" />Cho phép bán<InfoIcon /></label>
            <label className="flex items-center text-sm text-slate-700"><input checked={product.taxable} className="mr-2 h-4 w-4 rounded border-slate-300 text-primary" disabled type="checkbox" />Áp dụng thuế<InfoIcon /></label>
          </div>
          <button className="absolute -right-3 -top-5 grid h-10 w-10 place-items-center rounded-full bg-primary text-white shadow-lg" type="button" aria-label="Trợ giúp"><MessageCircle className="h-5 w-5" /></button>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border bg-white shadow-soft">
        <div className="flex border-b">
          <button className="border-b-2 border-primary px-6 py-3 text-sm font-semibold text-primary" type="button">Tồn kho</button>
          <button className="px-6 py-3 text-sm font-semibold text-slate-500 hover:text-primary" type="button">Lịch sử kho</button>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="border-b px-4 py-3">Chi nhánh</th>
                <th className="border-b px-4 py-3">Tồn kho <InfoIcon /></th>
                <th className="border-b px-4 py-3">Giá vốn <InfoIcon /></th>
                <th className="border-b px-4 py-3">Có thể bán <InfoIcon /></th>
                <th className="border-b px-4 py-3">Đang giao dịch <InfoIcon /></th>
                <th className="border-b px-4 py-3">Hàng đang về <InfoIcon /></th>
                <th className="border-b px-4 py-3">Hàng đang giao <InfoIcon /></th>
                <th className="border-b px-4 py-3">Tồn tối thiểu <InfoIcon /></th>
                <th className="border-b px-4 py-3">Tồn tối đa <InfoIcon /></th>
                <th className="border-b px-4 py-3">Điểm lưu kho</th>
              </tr>
            </thead>
            <tbody>
              {product.locations.map((location) => (
                <tr key={location.id} className="text-slate-700 hover:bg-slate-50">
                  <td className="px-4 py-4">{location.name}</td>
                  <td className="px-4 py-4 text-center">{fmtNumber(location.quantity)}</td>
                  <td className="px-4 py-4 text-center">{formatCurrencyVND(location.cost_price)}</td>
                  <td className="px-4 py-4 text-center">{fmtNumber(location.available_quantity)}</td>
                  <td className="px-4 py-4 text-center">{fmtNumber(location.quantity_on_hold)}</td>
                  <td className="px-4 py-4 text-center">{fmtNumber(location.incoming_quantity)}</td>
                  <td className="px-4 py-4 text-center">{fmtNumber(location.delivering_quantity)}</td>
                  <td className="px-4 py-4 text-center">{location.min_stock === null ? "---" : fmtNumber(location.min_stock)}</td>
                  <td className="px-4 py-4 text-center">{location.max_stock === null ? "---" : fmtNumber(location.max_stock)}</td>
                  <td className="px-4 py-4">{location.storage_location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
