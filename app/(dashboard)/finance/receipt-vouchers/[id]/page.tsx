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

interface VoucherDetail {
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

const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

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

export default function ReceiptVoucherDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [voucher, setVoucher] = useState<VoucherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/cash-book/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) throw new Error(d.error);
        if (d?.voucher_type !== "receipt") throw new Error("Không tìm thấy phiếu thu.");
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
        <div className="p-6 text-red-600">{error || "Không tìm thấy phiếu thu."}</div>
        <button onClick={() => router.push("/finance/receipt-vouchers")} className="text-blue-600 underline ml-6">
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const meta = STATUS_META[voucher.status] ?? STATUS_META.draft;

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      <header className="h-14 bg-white border-b px-4 flex items-center justify-between flex-shrink-0">
        <button onClick={() => router.push("/finance/receipt-vouchers")}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600">
          <ArrowLeft className="w-4 h-4" />
          <span className="font-medium">Phiếu thu: {voucher.code}</span>
        </button>
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <button className="flex items-center gap-1.5 hover:text-blue-600">
            <FileText className="w-4 h-4" /> Tư vấn thuế
          </button>
          <button className="flex items-center gap-1.5 hover:text-blue-600">
            <HelpCircle className="w-4 h-4" /> Trợ giúp
          </button>
          <div className="flex items-center gap-2 border-l pl-4">
            <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">N</div>
            <span className="font-medium text-slate-800">NA</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 bg-[#f4f6f8]">
        <div className="max-w-4xl mx-auto grid grid-cols-12 gap-6">
          {/* Left col */}
          <div className="col-span-8 space-y-6">
            <section className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <span className="font-bold text-gray-800">Thông tin phiếu thu</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${meta.className}`}>{meta.label}</span>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Mã phiếu thu</div>
                    <div className="font-medium text-blue-600">{voucher.code}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Loại phiếu</div>
                    <div>{voucher.payment_category || "Tự động"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Nhóm người nộp</div>
                    <div>{voucher.group_name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Tên người nộp</div>
                    <div className="font-medium">{voucher.person_name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Chứng từ gốc</div>
                    <div className="text-blue-600">{voucher.reference_code || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Số tiền thu</div>
                    <div className="font-bold text-green-600 text-base">{fmtMoney.format(voucher.amount)} đ</div>
                  </div>
                  {voucher.note && (
                    <div className="col-span-2">
                      <div className="text-xs text-gray-500 mb-1">Ghi chú</div>
                      <div>{voucher.note}</div>
                    </div>
                  )}
                </div>
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
                onClick={() => router.push(`/finance/receipt-vouchers/${id}/edit`)}
                className="flex-1 px-4 py-2 border border-blue-500 text-blue-500 rounded text-sm font-medium hover:bg-blue-50"
              >
                Sửa
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Bạn có chắc muốn xóa phiếu này?")) return;
                  const r = await fetch(`/api/cash-book/${id}`, { method: "DELETE" });
                  if (r.ok) router.push("/finance/receipt-vouchers");
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

      <div className="px-4 py-4 bg-gray-50 border-t flex justify-center flex-shrink-0">
        <div className="bg-white border rounded-lg px-6 py-4 flex items-center shadow-sm">
          <svg className="w-5 h-5 text-blue-500 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-slate-600">
            Bạn có thể xem thêm hướng dẫn về phiếu thu{" "}
            <a className="text-blue-500 hover:underline" href="#">Tại đây</a>
          </span>
        </div>
      </div>
    </div>
  );
}
