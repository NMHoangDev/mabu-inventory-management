"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";
import { PROMOTION_METHOD_LABELS, type PromotionCandidate } from "@/lib/promotions/types";

interface ApplyPromotionModalProps {
  candidates: PromotionCandidate[];
  appliedIds: string[];
  loading: boolean;
  onClose: () => void;
  onApply: (ids: string[]) => void;
  onClear: () => void;
}

/** "Áp dụng khuyến mại" — gợi ý rồi bấm Áp dụng (KHÔNG tự động trừ ngay), đúng
 *  luồng Sapo trong ảnh mẫu. Chỉ hiện các CTKM `eligible` (đủ điều kiện). */
export function ApplyPromotionModal({ candidates, appliedIds, loading, onClose, onApply, onClear }: ApplyPromotionModalProps) {
  const eligible = candidates.filter((c) => c.eligible);
  const [selected, setSelected] = useState<string[]>(appliedIds);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleSelected = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-slate-800">Áp dụng khuyến mại</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[#005baf]" />
            </div>
          ) : eligible.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[#404754]">
              Không có chương trình khuyến mại nào phù hợp với đơn hàng hiện tại.
            </div>
          ) : (
            <div className="divide-y divide-[#c0c6d6]">
              {eligible.map((c) => (
                <div key={c.promotion_id} className="px-6 py-4 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(c.promotion_id)}
                    onChange={() => toggleSelected(c.promotion_id)}
                    className="w-4 h-4 mt-1 rounded border-[#c0c6d6] text-[#005baf] focus:ring-[#005baf]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#0d1d29]">{c.name}</div>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#ebf5ff] text-[#005baf]">
                      {PROMOTION_METHOD_LABELS[c.method]}
                    </span>
                    {c.has_conflict && (
                      <p className="mt-1 text-[11px] text-orange-600">
                        Sẽ thay thế chiết khấu tay đang có trên một số dòng sản phẩm.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleExpanded(c.promotion_id)}
                      className="mt-1.5 flex items-center gap-1 text-xs text-[#005baf] hover:underline"
                    >
                      Xem điều kiện
                      {expanded.has(c.promotion_id) ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {expanded.has(c.promotion_id) && (
                      <ul className="mt-2 pl-4 list-disc text-xs text-[#404754] space-y-1">
                        {c.condition_lines.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-[#ba1a1a] whitespace-nowrap">
                    -{formatCurrencyVND(c.total_discount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t sticky bottom-0 bg-white flex items-center justify-between">
          <button
            type="button"
            onClick={onClear}
            disabled={appliedIds.length === 0}
            className="text-sm font-medium text-[#ba1a1a] hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
          >
            Ngừng áp dụng
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-slate-300 rounded text-slate-700 bg-white hover:bg-slate-50 text-sm font-medium"
            >
              Thoát
            </button>
            <button
              type="button"
              onClick={() => onApply(selected)}
              className="px-6 py-2 bg-[#005baf] text-white rounded text-sm font-medium hover:bg-[#005eb3]"
            >
              Áp dụng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
