"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  ChevronRight,
  FileText,
  HelpCircle
} from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";

interface PaymentDetail {
  id: string;
  code: string;
  voucher_type: string;
  payment_type: string;
  payment_category: string;
  group_name: string;
  person_name: string;
  reference_code: string;
  reference_type: string;
  payment_method: string;
  amount: number;
  branch: string;
  recorded_date: string;
  note: string;
  tags: string[];
  debt_change: boolean;
  business_acc: boolean;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: "Nháp", className: "bg-slate-100 text-slate-600" },
  completed: { label: "Hoàn thành", className: "bg-green-100 text-green-700" },
  cancelled: { label: "Đã hủy", className: "bg-red-50 text-red-600" }
};

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  "": "Tự động",
  order_payment: "Thanh toán cho đơn nhập hàng",
  supplier_payment: "Thanh toán cho nhà cung cấp",
  other: "Khác"
};

export default function PaymentVoucherDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [voucher, setVoucher] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/cash-book/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) throw new Error(d.error);
        if (d?.voucher_type !== "payment") throw new Error("Không tìm thấy phiếu chi.");
        setVoucher(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Có lỗi khi tải."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4.5rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !voucher) {
    return (
      <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
        <div className="p-6 text-red-600">{error || "Không tìm thấy phiếu chi."}</div>
        <button onClick={() => router.push("/finance/payment-vouchers")} className="text-blue-600 underline ml-6">
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const meta = STATUS_META[voucher.status] ?? STATUS_META.draft;

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0 z-10">
        <button onClick={() => router.push("/finance/payment-vouchers")}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-medium text-gray-800">Phiếu chi: {voucher.code}</span>
        </button>
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <button className="flex items-center gap-1.5 hover:text-blue-600">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Trợ giúp
          </button>
          <div className="flex items-center gap-2 border-l pl-4">
            <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">N</div>
            <span className="font-medium">NA</span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 bg-[#f4f6f8]">
        <div className="max-w-[1200px] mx-auto grid grid-cols-12 gap-6">
          {/* Left col */}
          <div className="col-span-8 space-y-6">
            <section className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 font-bold text-gray-800">
                Thông tin chung
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Mã phiếu</div>
                    <div className="font-medium text-blue-600">{voucher.code}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Loại phiếu chi</div>
                    <div>{PAYMENT_TYPE_LABEL[voucher.payment_type] ?? voucher.payment_category ?? "Tự động"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Nhóm người nhận</div>
                    <div>{voucher.group_name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Tên người nhận</div>
                    <div className="font-medium">{voucher.person_name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Hình thức thanh toán</div>
                    <div>{voucher.payment_method || "Tiền mặt"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Tham chiếu</div>
                    <div className="text-blue-600">{voucher.reference_code || "—"}</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 font-bold text-gray-800">
                Giá trị ghi nhận
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Giá trị</div>
                    <div className="font-bold text-red-600 text-base">{formatCurrencyVND(voucher.amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Trạng thái</div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${meta.className}`}>{meta.label}</span>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className={`w-4 h-4 rounded flex items-center justify-center text-xs ${voucher.debt_change ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                      {voucher.debt_change ? "✓" : "—"}
                    </div>
                    <span className="text-gray-600">Thay đổi công nợ đối tượng nhận</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className={`w-4 h-4 rounded flex items-center justify-center text-xs ${voucher.business_acc ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                      {voucher.business_acc ? "✓" : "—"}
                    </div>
                    <span className="text-gray-600">Hạch toán kết quả kinh doanh</span>
                  </div>
                </div>
                {voucher.note && (
                  <div className="mt-4">
                    <div className="text-xs text-gray-500 mb-1">Mô tả</div>
                    <div className="text-sm text-gray-700">{voucher.note}</div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Right col */}
          <div className="col-span-4 space-y-6">
            <section className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 font-bold text-gray-800">
                Thông tin bổ sung
              </div>
              <div className="p-6 space-y-4 text-sm">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Chi nhánh</div>
                  <div>{voucher.branch || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Ngày ghi nhận</div>
                  <div>{voucher.recorded_date ? formatDateTime(voucher.recorded_date).split(" ")[0] : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Người tạo</div>
                  <div>{voucher.created_by || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Ngày tạo</div>
                  <div>{formatDateTime(voucher.created_at)}</div>
                </div>
                {voucher.tags && voucher.tags.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Tags</div>
                    <div className="flex flex-wrap gap-1">
                      {voucher.tags.map((tag, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 rounded text-xs">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/finance/payment-vouchers/${id}/edit`)}
                className="flex-1 px-4 py-2 border border-blue-500 text-blue-500 rounded text-sm font-medium hover:bg-blue-50"
              >
                Sửa
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Bạn có chắc muốn xóa phiếu này?")) return;
                  const r = await fetch(`/api/cash-book/${id}`, { method: "DELETE" });
                  if (r.ok) router.push("/finance/payment-vouchers");
                  else alert("Xóa thất bại.");
                }}
                className="flex-1 px-4 py-2 border border-red-400 text-red-500 rounded text-sm font-medium hover:bg-red-50"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 bg-blue-50 border-t flex justify-center flex-shrink-0">
        <div className="bg-white border rounded-lg px-6 py-4 flex items-center shadow-sm max-w-2xl w-full">
          <div className="bg-blue-200 p-2 rounded-full mr-4 flex-shrink-0">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-slate-700">
            Bạn có thể xem thêm hướng dẫn về phiếu chi{" "}
            <a className="text-blue-600 font-medium underline" href="#">tại đây</a>
          </p>
        </div>
      </div>
    </div>
  );
}
