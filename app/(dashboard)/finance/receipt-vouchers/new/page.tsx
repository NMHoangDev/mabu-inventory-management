"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageGuard } from "@/components/auth/PageGuard";
import {
  ArrowLeft,
  ChevronDown,
  Loader2
} from "lucide-react";

interface CreateFormData {
  code: string;
  group_name: string;
  person_name: string;
  reference_code: string;
  reference_type: string;
  amount: string;
  note: string;
}

const GROUPS = [
  "Khách hàng",
  "Nhà cung cấp",
  "Nhân viên",
  "Khác"
];

export default function NewReceiptVoucherPage() {
  const router = useRouter();
  const [form, setForm] = useState<CreateFormData>({
    code: "RVN00001",
    group_name: "Khách hàng",
    person_name: "",
    reference_code: "",
    reference_type: "",
    amount: "",
    note: ""
  });
  const [codeLoading, setCodeLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setCodeLoading(true);
    fetch("/api/cash-book/next-code?voucher_type=receipt")
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.code) setForm((f) => ({ ...f, code: d.code })); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setCodeLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function setField(key: keyof CreateFormData, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = Number(form.amount.replace(/[^0-9]/g, ""));
    if (!amountNum || amountNum <= 0) {
      setError("Số tiền thu là bắt buộc và phải lớn hơn 0.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/cash-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voucher_type: "receipt",
          group_name: form.group_name,
          person_name: form.person_name,
          reference_code: form.reference_code,
          reference_type: form.reference_type,
          amount: amountNum,
          note: form.note,
          status: "completed"
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tạo được phiếu thu.");
      router.push(`/finance/receipt-vouchers/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi tạo phiếu thu.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageGuard permission="receipt_vouchers.create">
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6 bg-[#f3f4f6]">
      <header className="h-14 bg-white border-b px-4 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => router.push("/finance/receipt-vouchers")}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-medium">Tạo phiếu thu</span>
        </button>
        <div className="flex space-x-3">
          <button
            onClick={() => router.push("/finance/receipt-vouchers")}
            className="px-5 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Thoát
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 bg-[#0088ff] text-white rounded text-sm font-medium hover:bg-[#0077ee] disabled:opacity-60 flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Tạo phiếu thu
          </button>
        </div>
      </header>

      {error ? (
        <div className="mx-6 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl space-y-4">
          <section className="bg-white rounded shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-slate-800">Thông tin phiếu thu</h2>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
              <div className="flex flex-col space-y-1">
                <label className="text-xs font-medium text-gray-500">Mã phiếu thu</label>
                <input
                  value={form.code}
                  onChange={(e) => setField("code", e.target.value)}
                  disabled={codeLoading}
                  className="border-gray-300 rounded text-sm py-2 bg-gray-50"
                />
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-xs font-medium text-gray-500">
                  Nhóm người nộp <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={form.group_name}
                    onChange={(e) => setField("group_name", e.target.value)}
                    className="w-full border-gray-300 rounded text-sm py-2 pr-8 appearance-none bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-xs font-medium text-gray-500">
                  Tên người nộp <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.person_name}
                  onChange={(e) => setField("person_name", e.target.value)}
                  className="border-gray-300 rounded text-sm py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Nhập tên người nộp"
                />
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-xs font-medium text-gray-500">Chứng từ gốc</label>
                <input
                  value={form.reference_code}
                  onChange={(e) => setField("reference_code", e.target.value)}
                  className="border-gray-300 rounded text-sm py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Mã đơn hàng, hóa đơn..."
                />
              </div>
              <div className="flex flex-col space-y-1 col-span-2">
                <label className="text-xs font-medium text-gray-500">
                  Số tiền thu (VNĐ) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.amount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    setField("amount", raw ? Number(raw).toLocaleString("vi-VN") : "");
                  }}
                  className="border-gray-300 rounded text-sm py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col space-y-1 col-span-2">
                <label className="text-xs font-medium text-gray-500">Ghi chú</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setField("note", e.target.value)}
                  rows={3}
                  className="border-gray-300 rounded text-sm py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                  placeholder="Nhập ghi chú..."
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="px-4 py-4 bg-gray-50 border-t flex justify-center">
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
    </PageGuard>
  );
}
