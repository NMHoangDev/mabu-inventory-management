"use client";

// ⚠️ CHỈ ĐƯỢC IMPORT `@/lib/promotions/types` — TUYỆT ĐỐI KHÔNG import
// `@/lib/promotions/repository` (kéo theo `pg`, sẽ vỡ build vì đây là
// component "use client"). Xem ghi chú đầu lib/promotions/types.ts.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  emptyPromotionForm,
  validatePromotionForm,
  PROMOTION_EDITABLE_STATUS_LABELS,
  type Promotion,
  type PromotionFormValues,
  type PromotionMethod,
} from "@/lib/promotions/types";
import { DiscountMethodFields } from "./DiscountMethodFields";

interface PromotionFormProps {
  mode: "create" | "edit";
  promotionId?: string;
  initialMethod?: PromotionMethod;
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function promotionToFormValues(p: Promotion): PromotionFormValues {
  const base = emptyPromotionForm(p.method);
  base.rules[p.method] = p.rules as any;
  return {
    name: p.name,
    code: p.code,
    description: p.description,
    quantity_limit: p.usage_limit,
    unlimited_quantity: p.usage_limit === null,
    starts_at: toDatetimeLocal(p.starts_at),
    ends_at: toDatetimeLocal(p.ends_at),
    status: p.status,
    method: p.method,
    rules: base.rules,
  };
}

export function PromotionForm({ mode, promotionId, initialMethod }: PromotionFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<PromotionFormValues>(() => emptyPromotionForm(initialMethod ?? "by_quantity"));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(mode === "edit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const lastQtyRef = useRef<number>(1);

  useEffect(() => {
    if (mode !== "edit" || !promotionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/promotions/${promotionId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Không tải được khuyến mại.");
        if (!cancelled) {
          const form = promotionToFormValues(data as Promotion);
          setValues(form);
          if (form.quantity_limit) lastQtyRef.current = form.quantity_limit;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Không tải được khuyến mại.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, promotionId]);

  const handleSubmit = async () => {
    const validationErrors = validatePromotionForm(values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setError("Vui lòng kiểm tra lại thông tin đã nhập.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const rules = values.rules[values.method];
      const body = {
        name: values.name.trim(),
        code: values.code.trim() || undefined,
        description: values.description,
        method: values.method,
        status: values.status,
        rules,
        usage_limit: values.unlimited_quantity ? null : values.quantity_limit,
        starts_at: values.starts_at ? new Date(values.starts_at).toISOString() : undefined,
        ends_at: values.ends_at ? new Date(values.ends_at).toISOString() : null,
      };
      const url = mode === "create" ? "/api/promotions" : `/api/promotions/${promotionId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không lưu được khuyến mại.");
      router.push("/promotions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được khuyến mại.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4.5rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-[#005baf]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6 bg-slate-100">
      <header className="h-14 bg-white border-b px-6 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => router.push("/promotions")}
          className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách khuyến mại
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/promotions")}
            className="px-6 py-2 border border-slate-300 rounded text-slate-700 bg-white hover:bg-slate-50 text-sm font-medium"
          >
            Thoát
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-[#005baf] text-white rounded hover:bg-[#005eb3] text-sm font-medium disabled:opacity-60 flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "create" ? "Tạo khuyến mại" : "Lưu"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <div className="bg-white rounded shadow-sm p-5">
              <h2 className="text-base font-semibold mb-4 text-slate-800">Thông tin chung</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#404754] mb-1">Tên khuyến mại *</label>
                  <input
                    value={values.name}
                    onChange={(e) => {
                      setValues((v) => ({ ...v, name: e.target.value }));
                      setErrors((er) => ({ ...er, name: "" }));
                    }}
                    onBlur={() => setErrors((er) => ({ ...er, name: values.name.trim() ? "" : "Tên khuyến mại không được để trống" }))}
                    className={`w-full p-2 border rounded text-sm outline-none ${errors.name ? "border-[#ba1a1a] focus:ring-1 focus:ring-[#ba1a1a]" : "border-[#c0c6d6] focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf]"}`}
                    placeholder="Nhập tên chương trình khuyến mại"
                  />
                  {errors.name && <p className="mt-1 text-xs text-[#ba1a1a]">{errors.name}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#404754] mb-1">Mã khuyến mại</label>
                  <input
                    value={values.code}
                    onChange={(e) => setValues((v) => ({ ...v, code: e.target.value.toUpperCase() }))}
                    className="w-full p-2 border border-[#c0c6d6] rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
                    placeholder="Tự động sinh nếu để trống"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#404754] mb-1">Số lượng áp dụng *</label>
                  <input
                    disabled={values.unlimited_quantity}
                    value={values.unlimited_quantity ? "Không giới hạn" : values.quantity_limit ?? ""}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^\d]/g, ""));
                      setValues((v) => ({ ...v, quantity_limit: Number.isFinite(n) ? n : 0 }));
                      setErrors((er) => ({ ...er, quantity_limit: "" }));
                    }}
                    className={`w-full p-2 border rounded text-sm outline-none ${
                      values.unlimited_quantity ? "bg-[#f4f6f8] text-[#404754] cursor-not-allowed" : ""
                    } ${errors.quantity_limit ? "border-[#ba1a1a]" : "border-[#c0c6d6] focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf]"}`}
                  />
                  {errors.quantity_limit && <p className="mt-1 text-xs text-[#ba1a1a]">{errors.quantity_limit}</p>}
                  <label className="flex items-center gap-2 mt-2 text-xs text-[#404754]">
                    <input
                      type="checkbox"
                      checked={values.unlimited_quantity}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (!checked) {
                          setValues((v) => ({ ...v, unlimited_quantity: false, quantity_limit: lastQtyRef.current }));
                        } else {
                          if (values.quantity_limit) lastQtyRef.current = values.quantity_limit;
                          setValues((v) => ({ ...v, unlimited_quantity: true, quantity_limit: null }));
                        }
                      }}
                      className="w-4 h-4 rounded border-[#c0c6d6] text-[#005baf] focus:ring-[#005baf]"
                    />
                    Không giới hạn số lượng
                  </label>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[#404754] mb-1">Mô tả</label>
                  <textarea
                    value={values.description}
                    onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                    className="w-full h-20 p-2 border border-[#c0c6d6] rounded text-sm resize-none focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded shadow-sm p-5">
              <h2 className="text-base font-semibold mb-4 text-slate-800">Điều kiện áp dụng</h2>
              <DiscountMethodFields
                method={values.method}
                rules={values.rules}
                errors={errors}
                onMethodChange={(m) => setValues((v) => ({ ...v, method: m }))}
                onRulesChange={(m, rules) =>
                  setValues((v) => ({ ...v, rules: { ...v.rules, [m]: rules } }))
                }
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded shadow-sm p-5">
              <h2 className="text-base font-semibold mb-4 text-slate-800">Thời gian áp dụng</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#404754] mb-1">Ngày bắt đầu</label>
                  <input
                    type="datetime-local"
                    value={values.starts_at}
                    onChange={(e) => setValues((v) => ({ ...v, starts_at: e.target.value }))}
                    className="w-full p-2 border border-[#c0c6d6] rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#404754] mb-1">Ngày kết thúc</label>
                  <input
                    type="datetime-local"
                    value={values.ends_at}
                    onChange={(e) => {
                      setValues((v) => ({ ...v, ends_at: e.target.value }));
                      setErrors((er) => ({ ...er, ends_at: "" }));
                    }}
                    className={`w-full p-2 border rounded text-sm outline-none ${errors.ends_at ? "border-[#ba1a1a]" : "border-[#c0c6d6] focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf]"}`}
                  />
                  {errors.ends_at && <p className="mt-1 text-xs text-[#ba1a1a]">{errors.ends_at}</p>}
                  <label className="flex items-center gap-2 mt-2 text-xs text-[#404754]">
                    <input
                      type="checkbox"
                      checked={values.ends_at === ""}
                      onChange={(e) => setValues((v) => ({ ...v, ends_at: e.target.checked ? "" : v.ends_at }))}
                      className="w-4 h-4 rounded border-[#c0c6d6] text-[#005baf] focus:ring-[#005baf]"
                    />
                    Không giới hạn ngày kết thúc
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-white rounded shadow-sm p-5">
              <h2 className="text-base font-semibold mb-4 text-slate-800">Trạng thái</h2>
              <select
                value={values.status}
                onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as PromotionFormValues["status"] }))}
                className="w-full p-2 border border-[#c0c6d6] rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
              >
                {Object.entries(PROMOTION_EDITABLE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
