"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageGuard } from "@/components/auth/PageGuard";
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  Info
} from "lucide-react";

interface CreateFormData {
  code: string;
  group_name: string;
  person_name: string;
  payment_type: string;
  payment_category: string;
  reference_code: string;
  payment_method: string;
  amount: string;
  branch: string;
  recorded_date: string;
  note: string;
  tags: string;
  debt_change: boolean;
  business_acc: boolean;
}

const GROUP_OPTIONS = [
  "Khách hàng",
  "Nhà cung cấp",
  "Nhân viên",
  "Khác"
];

const PAYMENT_TYPE_OPTIONS = [
  { value: "", label: "Tự động" },
  { value: "order_payment", label: "Thanh toán cho đơn nhập hàng" },
  { value: "supplier_payment", label: "Thanh toán cho nhà cung cấp" },
  { value: "other", label: "Khác" }
];

const PAYMENT_METHOD_OPTIONS = [
  "Tiền mặt",
  "Chuyển khoản",
  "Quẹt thẻ",
  "Ví điện tử"
];

export default function NewPaymentVoucherPage() {
  const router = useRouter();
  const [form, setForm] = useState<CreateFormData>({
    code: "",
    group_name: "Nhà cung cấp",
    person_name: "",
    payment_type: "",
    payment_category: "Tự động",
    reference_code: "",
    payment_method: "Tiền mặt",
    amount: "",
    branch: "Chi nhánh mặc định",
    recorded_date: "",
    note: "",
    tags: "",
    debt_change: true,
    business_acc: true
  });
  const [codeLoading, setCodeLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setCodeLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    fetch("/api/cash-book/next-code?voucher_type=payment")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setForm((f) => ({ ...f, code: d?.code ?? "PVN00001", recorded_date: today }));
        }
      })
      .catch(() => { if (!cancelled) setForm((f) => ({ ...f, code: "PVN00001", recorded_date: today })); })
      .finally(() => { if (!cancelled) setCodeLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function setField(key: keyof CreateFormData, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handlePaymentTypeChange(value: string) {
    const cat = PAYMENT_TYPE_OPTIONS.find((o) => o.value === value);
    setForm((f) => ({
      ...f,
      payment_type: value,
      payment_category: cat?.label ?? "Tự động"
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = Number(form.amount.replace(/[^0-9]/g, ""));
    if (!amountNum || amountNum <= 0) {
      setError("Giá trị là bắt buộc và phải lớn hơn 0.");
      return;
    }
    if (!form.person_name.trim()) {
      setError("Tên người nhận là bắt buộc.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/cash-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voucher_type: "payment",
          payment_type: form.payment_type || undefined,
          payment_category: form.payment_category,
          group_name: form.group_name,
          person_name: form.person_name.trim(),
          reference_code: form.reference_code.trim(),
          payment_method: form.payment_method,
          amount: amountNum,
          branch: form.branch,
          recorded_date: form.recorded_date || undefined,
          note: form.note.trim(),
          tags: form.tags.trim() ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          debt_change: form.debt_change,
          business_acc: form.business_acc,
          status: "completed"
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tạo được phiếu chi.");
      router.push(`/finance/payment-vouchers/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi tạo phiếu chi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageGuard permission="payment_vouchers.create">
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6 bg-[#f4f6f8]">
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0 z-10">
        <button
          onClick={() => router.push("/finance/payment-vouchers")}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-medium text-gray-800">Thêm mới phiếu chi</span>
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/finance/payment-vouchers")}
            className="px-5 py-1.5 border border-blue-500 text-blue-500 rounded font-medium text-sm hover:bg-blue-50"
          >
            Thoát
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-1.5 bg-blue-500 text-white rounded font-medium text-sm hover:bg-blue-600 disabled:opacity-60 flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Lưu
          </button>
        </div>
      </header>

      {error ? (
        <div className="mx-6 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto grid grid-cols-12 gap-6">
          {/* Left column */}
          <div className="col-span-8 space-y-6">
            {/* Section: Thông tin chung */}
            <section className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 font-bold text-gray-800">
                Thông tin chung
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  {/* Nhóm người nhận */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 required">
                      Nhóm người nhận <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={form.group_name}
                        onChange={(e) => setField("group_name", e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm appearance-none bg-white pr-10 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                      >
                        {GROUP_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Tên người nhận */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 required">
                      Tên người nhận <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={form.person_name}
                      onChange={(e) => setField("person_name", e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                      placeholder="Nhập tên người nhận"
                    />
                  </div>

                  {/* Loại phiếu chi */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 required">
                      Loại phiếu chi <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={form.payment_type}
                        onChange={(e) => handlePaymentTypeChange(e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm appearance-none bg-white pr-10 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                      >
                        {PAYMENT_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Mã phiếu */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <span className="flex items-center gap-1">
                        Mã phiếu
                        <Info className="w-3.5 h-3.5 text-blue-400" />
                      </span>
                    </label>
                    <input
                      value={form.code}
                      onChange={(e) => setField("code", e.target.value)}
                      disabled={codeLoading}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50 focus:outline-none"
                      placeholder="Mã phiếu tự động"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Section: Giá trị ghi nhận */}
            <section className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 font-bold text-gray-800">
                Giá trị ghi nhận
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                  {/* Giá trị */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 required">
                      Giá trị <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.amount}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        setField("amount", raw ? Number(raw).toLocaleString("vi-VN") : "");
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                      placeholder="0"
                    />
                  </div>

                  {/* Hình thức thanh toán */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Hình thức thanh toán
                    </label>
                    <div className="relative">
                      <select
                        value={form.payment_method}
                        onChange={(e) => setField("payment_method", e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm appearance-none bg-white pr-10 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                      >
                        {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Tham chiếu */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tham chiếu
                    </label>
                    <input
                      value={form.reference_code}
                      onChange={(e) => setField("reference_code", e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                      placeholder="Mã đơn nhập hàng, hóa đơn..."
                    />
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="flex items-center">
                    <input
                      id="debt-change"
                      type="checkbox"
                      checked={form.debt_change}
                      onChange={(e) => setField("debt_change", e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label className="ml-2 text-sm text-gray-700 flex items-center gap-1" htmlFor="debt-change">
                      Thay đổi công nợ đối tượng nộp
                      <Info className="w-3.5 h-3.5 text-blue-400" />
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      id="business-acc"
                      type="checkbox"
                      checked={form.business_acc}
                      onChange={(e) => setField("business_acc", e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label className="ml-2 text-sm text-gray-700" htmlFor="business-acc">
                      Hạch toán kết quả kinh doanh
                    </label>
                  </div>
                  <p className="text-xs text-red-500 italic">
                    Lưu ý: Hạch toán kết quả kinh doanh đang được thiết lập theo loại phiếu chi. Bạn có thể thay đổi hoặc sửa thiết lập mặc định{" "}
                    <a className="text-blue-500 underline" href="#">tại đây</a>.
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Right column */}
          <div className="col-span-4 space-y-6">
            {/* Section: Thông tin bổ sung */}
            <section className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 font-bold text-gray-800">
                Thông tin bổ sung
              </div>
              <div className="p-6 space-y-4">
                {/* Chi nhánh */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Chi nhánh
                  </label>
                  <div className="relative">
                    <select
                      value={form.branch}
                      onChange={(e) => setField("branch", e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm appearance-none bg-white pr-10 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                    >
                      <option>Chi nhánh mặc định</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Ngày ghi nhận */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ngày ghi nhận
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={form.recorded_date}
                      onChange={(e) => setField("recorded_date", e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm pr-10 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                    />
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>

                {/* Mô tả */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mô tả
                  </label>
                  <textarea
                    value={form.note}
                    onChange={(e) => setField("note", e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                    placeholder="Nhập mô tả..."
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags
                  </label>
                  <input
                    value={form.tags}
                    onChange={(e) => setField("tags", e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                    placeholder="Nhập tags, cách nhau bằng dấu phẩy"
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
    </PageGuard>
  );
}
