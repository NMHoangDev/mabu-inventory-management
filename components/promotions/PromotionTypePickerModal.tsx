"use client";

import { useRouter } from "next/navigation";
import { BadgePercent, Gift, X } from "lucide-react";

interface PromotionTypePickerModalProps {
  onClose: () => void;
}

/** Modal "Chọn loại khuyến mại" — 2 loại như Sapo. v1 chỉ "Chiết khấu" hoạt động;
 *  "Tặng sản phẩm" hiện nhưng KHÔNG bấm được (và cũng bị chặn ở server, xem
 *  lib/promotions/validation.ts + repository.ts) — cố ý để trạng thái "chưa làm"
 *  đọc ra là chủ đích, không phải hỏng. */
export function PromotionTypePickerModal({ onClose }: PromotionTypePickerModalProps) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-slate-800">Chọn loại khuyến mại</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => router.push("/promotions/new?method=by_quantity")}
            className="group text-left p-5 rounded-xl border-2 border-[#c0c6d6] hover:border-[#005baf] hover:bg-[#ebf5ff] transition-all flex flex-col items-start gap-3 focus:outline-none focus:ring-2 focus:ring-[#005baf]"
          >
            <div className="w-12 h-12 rounded-full bg-[#ebf5ff] flex items-center justify-center">
              <BadgePercent className="w-6 h-6 text-[#005baf]" />
            </div>
            <div className="text-sm font-bold text-[#0d1d29]">Chiết khấu</div>
            <div className="text-xs text-[#404754]">
              Giảm giá theo tổng đơn, theo từng sản phẩm, theo số lượng mua, hoặc cho sản phẩm mua thêm.
            </div>
          </button>

          <div
            aria-disabled="true"
            className="relative p-5 rounded-xl border-2 border-dashed border-[#c0c6d6] bg-[#f4f6f8] opacity-70 cursor-not-allowed flex flex-col items-start gap-3"
          >
            <span className="absolute top-3 right-3 px-2 py-1 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">
              Sắp có
            </span>
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
              <Gift className="w-6 h-6 text-[#404754]" />
            </div>
            <div className="text-sm font-bold text-[#404754]">Tặng sản phẩm</div>
            <div className="text-xs text-[#404754]">Tặng kèm sản phẩm khi khách mua đủ điều kiện.</div>
            <div className="text-[11px] text-[#404754] italic">
              Tính năng đang được phát triển, chưa sử dụng được.
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-slate-300 rounded text-slate-700 bg-white hover:bg-slate-50 text-sm font-medium"
          >
            Thoát
          </button>
        </div>
      </div>
    </div>
  );
}
