"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Save,
  Plus,
  Trash2,
  ShoppingCart,
  Image as ImageIcon,
} from "lucide-react";

interface ParsedItem {
  product_name: string;
  sku?: string;
  quantity: number;
  unit_price?: number;
  matched_product_id?: string;
  matched_sku?: string;
  confidence: "high" | "medium" | "low";
}

interface ParsedDraft {
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  note?: string;
  source: "store" | "facebook" | "zalo" | "website" | "other";
  items: ParsedItem[];
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  create_shipping: boolean;
}

const SAMPLE_INPUTS = [
  "Mai 0901234567 mua 2 áo thun đen size L 250k, 1 quần jean xanh 420k. Giao 12 Nguyễn Huệ Q1. Trả trước 50%",
  "Anh Tuấn 0987654321 đặt 3 hộp cà phê 85k, giao chung cư Vinhomes. Note: giao giờ hành chính",
];

const fmt = new Intl.NumberFormat("vi-VN");

export default function ParseOrderPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ParsedDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const onParse = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/orders/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed");
      setDraft(data.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi");
    } finally {
      setLoading(false);
    }
  };

  const onUploadImage = async (file: File) => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/orders/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed");
      setDraft(data.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi");
    } finally {
      setLoading(false);
    }
  };

  const onApply = async () => {
    if (!draft) return;
    setApplying(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/orders/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "apply", draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Apply failed");
      setSuccess(data.message);
      // Optionally redirect
      setTimeout(() => {
        if (data.order_id) router.push(`/orders/${data.order_id}`);
      }, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi");
    } finally {
      setApplying(false);
    }
  };

  const updateItem = (idx: number, patch: Partial<ParsedItem>) => {
    if (!draft) return;
    const items = [...draft.items];
    items[idx] = { ...items[idx], ...patch };
    setDraft({ ...draft, items });
  };

  const removeItem = (idx: number) => {
    if (!draft) return;
    setDraft({ ...draft, items: draft.items.filter((_, i) => i !== idx) });
  };

  const addItem = () => {
    if (!draft) return;
    setDraft({
      ...draft,
      items: [...draft.items, { product_name: "", quantity: 1, unit_price: 0, confidence: "low" }],
    });
  };

  const itemsTotal = draft?.items.reduce((s, it) => s + (it.quantity || 0) * (it.unit_price || 0), 0) ?? 0;
  const totalComputed = (draft?.items.reduce((s, it) => s + (it.quantity || 0) * (it.unit_price || 0), 0) ?? 0) - (draft?.discount ?? 0) + (draft?.shipping_fee ?? 0);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tạo đơn từ tin nhắn / ảnh</h1>
          <p className="text-xs text-slate-500">Dán tin nhắn Zalo/Messenger/SMS hoặc upload ảnh chụp — AI sẽ tự tách đơn.</p>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Input column */}
        <div className="panel p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Bước 1: Nhập tin nhắn</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ví dụ: Mai 0901234567 mua 2 áo thun đen 250k, 1 quần jean 420k. Giao 12 Nguyễn Huệ Q1"
            className="w-full h-40 p-3 text-sm border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={onParse}
              disabled={loading || !text.trim()}
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg font-medium hover:bg-purple-700 transition flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Parse bằng AI
            </button>

            <label className="px-4 py-2 border border-slate-300 text-sm rounded-lg font-medium cursor-pointer hover:bg-slate-50 transition flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Upload ảnh
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadImage(f);
                }}
              />
            </label>
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-2">💡 Hoặc thử mẫu:</p>
            <div className="space-y-1">
              {SAMPLE_INPUTS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setText(s)}
                  className="text-left text-xs p-2 rounded border border-slate-200 hover:bg-slate-50 w-full truncate"
                  title={s}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
        </div>

        {/* Output column */}
        <div className="panel p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Edit3 className="h-4 w-4" />
            Bước 2: Kiểm tra & sửa
          </h2>

          {!draft ? (
            <div className="text-sm text-slate-500 text-center py-12">
              Chưa có đơn phân tích. Hãy paste tin nhắn rồi bấm "Parse bằng AI".
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tên khách" value={draft.customer_name} onChange={(v) => setDraft({ ...draft, customer_name: v })} />
                <Field label="SĐT" value={draft.customer_phone} onChange={(v) => setDraft({ ...draft, customer_phone: v })} />
              </div>
              <Field label="Địa chỉ" value={draft.customer_address ?? ""} onChange={(v) => setDraft({ ...draft, customer_address: v })} />

              <div>
                <label className="text-xs text-slate-500">Nguồn đơn</label>
                <select
                  value={draft.source}
                  onChange={(e) => setDraft({ ...draft, source: e.target.value as any })}
                  className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="store">Tại cửa hàng</option>
                  <option value="facebook">Facebook</option>
                  <option value="zalo">Zalo</option>
                  <option value="website">Website</option>
                  <option value="other">Khác</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">Sản phẩm ({draft.items.length})</span>
                  <button onClick={addItem} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Thêm
                  </button>
                </div>
                <div className="space-y-2">
                  {draft.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-1 p-2 bg-slate-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <input
                          value={it.product_name}
                          onChange={(e) => updateItem(i, { product_name: e.target.value })}
                          className="w-full px-2 py-1 text-sm border border-slate-200 rounded bg-white"
                          placeholder="Tên sản phẩm"
                        />
                        <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                          {it.matched_sku && <span className="font-mono">SKU: {it.matched_sku}</span>}
                          <span className={confidenceColor(it.confidence)}>● {labelConfidence(it.confidence)}</span>
                        </div>
                      </div>
                      <input
                        type="number"
                        value={it.quantity}
                        onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 1 })}
                        className="w-14 px-2 py-1 text-sm text-right border border-slate-200 rounded bg-white"
                        min={1}
                      />
                      <input
                        type="number"
                        value={it.unit_price || ""}
                        onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 text-sm text-right border border-slate-200 rounded bg-white"
                        placeholder="Giá"
                      />
                      <button onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-2 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Tạm tính</span>
                  <span className="tabular-nums font-medium">{fmt.format(itemsTotal)}đ</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Giảm giá</span>
                  <input
                    type="number"
                    value={draft.discount}
                    onChange={(e) => setDraft({ ...draft, discount: Number(e.target.value) || 0 })}
                    className="w-24 px-2 py-1 text-sm text-right border border-slate-200 rounded"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Phí ship</span>
                  <input
                    type="number"
                    value={draft.shipping_fee}
                    onChange={(e) => setDraft({ ...draft, shipping_fee: Number(e.target.value) || 0 })}
                    className="w-24 px-2 py-1 text-sm text-right border border-slate-200 rounded"
                  />
                </div>
                <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-200">
                  <span>Tổng</span>
                  <span className="text-blue-600">{fmt.format(totalComputed)}đ</span>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.create_shipping}
                  onChange={(e) => setDraft({ ...draft, create_shipping: e.target.checked })}
                  className="rounded"
                />
                Tạo vận đơn kèm theo
              </label>

              {success && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {success}
                </div>
              )}

              <button
                onClick={onApply}
                disabled={applying || !draft.customer_name || draft.items.length === 0}
                className="w-full px-4 py-2.5 bg-emerald-600 text-white text-sm rounded-lg font-medium hover:bg-emerald-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu đơn hàng
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
      />
    </div>
  );
}

function confidenceColor(c: string) {
  if (c === "high") return "text-emerald-600";
  if (c === "medium") return "text-amber-600";
  return "text-red-600";
}
function labelConfidence(c: string) {
  if (c === "high") return "Khớp";
  if (c === "medium") return "Có thể";
  return "Cần kiểm tra";
}
