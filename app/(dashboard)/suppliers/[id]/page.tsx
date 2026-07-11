"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2, Pencil, Package, Trash2, Star, Truck } from "lucide-react";
import { AddSupplierModal } from "@/components/suppliers/AddSupplierModal";
import { SupplierProductSearch, type SupplierProductHit } from "@/components/suppliers/SupplierProductSearch";
import { formatCurrencyVND } from "@/lib/shared/format";

interface SupplierDetail {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  tax_code: string;
  address: string;
  ward: string;
  district: string;
  city: string;
  note: string;
  tags: string[];
  total_purchased: number;
  total_orders: number;
  last_order_at: string | null;
  status: string;
  created_at: string;
}

interface SupplierProductRow {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  stock: number;
  supplier_sku: string;
  cost_price: number | null;
  is_preferred: boolean;
}

interface PurchaseOrderRow {
  id: string;
  code: string;
  status: string;
  total: number;
  created_at: string;
  invoice_document_id: string | null;
  invoice_file_name: string | null;
}

interface GoodsReceiptRow {
  id: string;
  code: string;
  receipt_status: string;
  order_status: string;
  total_cost: number;
  received_at: string;
  purchase_order_id: string | null;
  invoice_document_id: string | null;
  invoice_file_name: string | null;
}

const PO_STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  pending: "Chờ nhận hàng",
  partial: "Nhận một phần",
  completed: "Hoàn thành",
  cancelled: "Đã hủy"
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

export default function SupplierDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const supplierId = params.id;

  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);

  const [products, setProducts] = useState<SupplierProductRow[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [removingProductId, setRemovingProductId] = useState<string | null>(null);

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceiptRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  const fetchSupplier = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/suppliers/${supplierId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tải được nhà cung cấp.");
      setSupplier(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi tải nhà cung cấp.");
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/products`);
      const data = await res.json();
      if (Array.isArray(data)) setProducts(data);
    } catch {
      /* giữ danh sách cũ nếu tải lại lỗi */
    } finally {
      setProductsLoading(false);
    }
  }, [supplierId]);

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/purchase-orders`);
      const data = await res.json();
      setPurchaseOrders(Array.isArray(data?.purchase_orders) ? data.purchase_orders : []);
      setGoodsReceipts(Array.isArray(data?.goods_receipts) ? data.goods_receipts : []);
    } catch {
      /* giữ danh sách cũ nếu tải lại lỗi */
    } finally {
      setOrdersLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    fetchSupplier();
    fetchProducts();
    fetchOrders();
  }, [fetchSupplier, fetchProducts, fetchOrders]);

  async function handleAddProduct(hit: SupplierProductHit) {
    setAddingProductId(hit.id);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: [hit.id] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không thêm được sản phẩm.");
      setProducts(Array.isArray(data) ? data : products);
      setNotice(`Đã thêm "${hit.name}" vào danh sách cung cấp.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi thêm sản phẩm.");
    } finally {
      setAddingProductId(null);
    }
  }

  async function handleRemoveProduct(row: SupplierProductRow) {
    if (!confirm(`Bỏ "${row.product_name}" khỏi danh sách sản phẩm NCC này cung cấp?`)) return;
    setRemovingProductId(row.product_id);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/products/${row.product_id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Không xoá được liên kết sản phẩm.");
      setProducts((prev) => prev.filter((p) => p.product_id !== row.product_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi khi xoá sản phẩm.");
    } finally {
      setRemovingProductId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4.5rem)] text-slate-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Đang tải…
      </div>
    );
  }

  if (error && !supplier) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4.5rem)] gap-4">
        <p className="text-red-600 text-sm">{error}</p>
        <button onClick={() => router.push("/suppliers")} className="text-blue-600 hover:underline text-sm">
          Quay lại danh sách nhà cung cấp
        </button>
      </div>
    );
  }

  if (!supplier) return null;

  const excludeIds = products.map((p) => p.product_id);

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6 bg-slate-100">
      <header className="h-14 bg-white border-b px-6 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => router.push("/suppliers")}
          className="flex items-center gap-2 text-[15px] text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft className="w-4 h-4" /> {supplier.name}
        </button>
        <button
          onClick={() => setShowEditModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
        >
          <Pencil className="w-4 h-4" /> Sửa nhà cung cấp
        </button>
      </header>

      {error ? (
        <div className="mx-6 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline">Đóng</button>
        </div>
      ) : null}
      {notice ? (
        <div className="mx-6 mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {notice}
          <button onClick={() => setNotice("")} className="ml-2 underline">Đóng</button>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4 space-y-6">
            <section className="bg-white rounded shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Thông tin chung</h2>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    supplier.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {supplier.status === "active" ? "Đang giao dịch" : "Ngừng giao dịch"}
                </span>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <Field label="Mã nhà cung cấp" value={supplier.code} />
                <Field label="Tên nhà cung cấp" value={supplier.name} />
                <Field label="Người liên hệ" value={supplier.contact_name} />
                <Field label="Số điện thoại" value={supplier.phone} />
                <Field label="Email" value={supplier.email} />
                <Field label="Mã số thuế" value={supplier.tax_code} />
                <Field
                  label="Địa chỉ"
                  value={[supplier.address, supplier.ward, supplier.district, supplier.city].filter(Boolean).join(", ")}
                />
                <Field label="Ghi chú" value={supplier.note} />
              </div>
            </section>

            <section className="bg-white rounded shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Lịch sử giao dịch</h2>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <Field label="Tổng tiền đã mua" value={formatCurrencyVND(supplier.total_purchased)} />
                <Field label="Số đơn nhập" value={String(supplier.total_orders)} />
                <Field label="Lần nhập gần nhất" value={formatDate(supplier.last_order_at)} />
              </div>
            </section>
          </div>

          <div className="col-span-8">
            <section className="bg-white rounded shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">
                  Sản phẩm đang cung cấp ({products.length})
                </h2>
              </div>
              <div className="p-4 border-b border-gray-100">
                <SupplierProductSearch
                  placeholder="Tìm sản phẩm để thêm vào danh sách cung cấp (theo tên hoặc SKU)..."
                  excludeIds={excludeIds}
                  onSelect={handleAddProduct}
                />
                {addingProductId ? (
                  <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Đang thêm...
                  </div>
                ) : null}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 font-medium">
                    <tr>
                      <th className="px-4 py-3 text-left w-16">Ảnh</th>
                      <th className="px-4 py-3 text-left">Tên sản phẩm</th>
                      <th className="px-4 py-3 text-right">Tồn kho hiện tại</th>
                      <th className="px-4 py-3 text-right">Giá nhập</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {productsLoading ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-500">
                          <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Đang tải...
                        </td>
                      </tr>
                    ) : products.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-16 text-center text-slate-500">
                          <div className="flex flex-col items-center gap-3">
                            <div className="bg-gray-100 p-5 rounded-full">
                              <Package className="h-10 w-10 text-gray-300" />
                            </div>
                            Nhà cung cấp này chưa có sản phẩm nào. Dùng ô tìm kiếm phía trên để thêm.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      products.map((row) => (
                        <tr key={row.product_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            {row.image_url ? (
                              <img src={row.image_url} alt="" className="w-10 h-10 object-cover rounded border" />
                            ) : (
                              <div className="w-10 h-10 bg-gray-100 rounded border flex items-center justify-center text-gray-300">
                                <Package className="w-5 h-5" />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/products/inventory/${row.product_id}`}
                              className="font-medium text-gray-800 hover:text-blue-600 hover:underline flex items-center gap-1"
                            >
                              {row.product_name}
                              {row.is_preferred ? <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> : null}
                            </Link>
                            <div className="text-xs text-gray-500">
                              {row.sku ? `SKU: ${row.sku}` : "—"}
                              {row.unit ? ` · ${row.unit}` : ""}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                            {row.stock.toLocaleString("vi-VN")}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                            {row.cost_price !== null ? formatCurrencyVND(row.cost_price) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleRemoveProduct(row)}
                              disabled={removingProductId === row.product_id}
                              title="Bỏ khỏi danh sách cung cấp"
                              className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                            >
                              {removingProductId === row.product_id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-6 bg-white rounded shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">
                  Đơn nhập hàng liên quan ({purchaseOrders.length + goodsReceipts.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 font-medium">
                    <tr>
                      <th className="px-4 py-3 text-left">Mã đơn</th>
                      <th className="px-4 py-3 text-left">Loại</th>
                      <th className="px-4 py-3 text-left">Trạng thái</th>
                      <th className="px-4 py-3 text-left">File hóa đơn scan</th>
                      <th className="px-4 py-3 text-right">Tổng tiền</th>
                      <th className="px-4 py-3 text-right">Ngày</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ordersLoading ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Đang tải...
                        </td>
                      </tr>
                    ) : purchaseOrders.length === 0 && goodsReceipts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-16 text-center text-slate-500">
                          <div className="flex flex-col items-center gap-3">
                            <div className="bg-gray-100 p-5 rounded-full">
                              <Truck className="h-10 w-10 text-gray-300" />
                            </div>
                            Chưa có đơn đặt hàng nhập hoặc phiếu nhập kho nào từ nhà cung cấp này.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {purchaseOrders.map((po) => (
                          <tr
                            key={`po-${po.id}`}
                            onClick={() => router.push(`/products/purchase-orders/${po.id}`)}
                            className="cursor-pointer hover:bg-gray-50"
                          >
                            <td className="px-4 py-3 font-medium text-blue-600">{po.code}</td>
                            <td className="px-4 py-3 text-gray-600">Đơn đặt hàng nhập</td>
                            <td className="px-4 py-3 text-gray-600">
                              {PO_STATUS_LABEL[po.status] ?? po.status}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {po.invoice_file_name ? (
                                <span className="inline-flex items-center gap-1">
                                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                                  {po.invoice_file_name}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                              {formatCurrencyVND(po.total)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">{formatDate(po.created_at)}</td>
                          </tr>
                        ))}
                        {goodsReceipts.map((gr) => (
                          <tr
                            key={`gr-${gr.id}`}
                            onClick={() => router.push(`/products/goods-receipts/${gr.id}`)}
                            className="cursor-pointer hover:bg-gray-50"
                          >
                            <td className="px-4 py-3 font-medium text-blue-600">{gr.code}</td>
                            <td className="px-4 py-3 text-gray-600">Phiếu nhập kho</td>
                            <td className="px-4 py-3 text-gray-600">
                              {PO_STATUS_LABEL[gr.receipt_status] ?? gr.receipt_status}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {gr.invoice_file_name ? (
                                <span className="inline-flex items-center gap-1">
                                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                                  {gr.invoice_file_name}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                              {formatCurrencyVND(gr.total_cost)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">{formatDate(gr.received_at)}</td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>

      {showEditModal ? (
        <AddSupplierModal
          supplierId={supplierId}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            fetchSupplier();
            fetchProducts();
            setNotice("Đã cập nhật nhà cung cấp.");
          }}
        />
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-gray-800">{value || "—"}</div>
    </div>
  );
}
