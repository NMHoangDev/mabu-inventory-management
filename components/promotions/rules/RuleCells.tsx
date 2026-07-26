"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";
import { SupplierProductSearch, type SupplierProductHit } from "@/components/suppliers/SupplierProductSearch";
import type { DiscountType } from "@/lib/promotions/types";

function formatNumberInput(value: number): string {
  if (!value) return "";
  return new Intl.NumberFormat("vi-VN").format(value);
}

function parseNum(text: string): number {
  const cleaned = text.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function NumberCell({
  value,
  onChange,
  placeholder,
  error,
  allowEmpty,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  error?: string;
  /** true: chuỗi rỗng -> null (dùng cho "SL đến" = không giới hạn). */
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(value === null ? "" : formatNumberInput(value));
  return (
    <div>
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (allowEmpty && raw.trim() === "") {
            onChange(null);
            return;
          }
          onChange(parseNum(raw));
        }}
        onBlur={() => setText(value === null ? "" : formatNumberInput(value))}
        className={`w-full text-right p-1.5 border rounded text-sm outline-none transition-colors ${
          error
            ? "border-[#ba1a1a] focus:ring-1 focus:ring-[#ba1a1a]"
            : "border-transparent hover:border-[#717785] focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf]"
        }`}
      />
      {error && <p className="mt-0.5 text-[11px] text-[#ba1a1a]">{error}</p>}
    </div>
  );
}

export function DiscountCell({
  type,
  value,
  onChange,
  onToggleType,
  error,
}: {
  type: DiscountType;
  value: number;
  onChange: (v: number) => void;
  onToggleType: () => void;
  error?: string;
}) {
  const [text, setText] = useState(formatNumberInput(value));
  return (
    <div>
      <div className="flex items-center gap-1">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parseNum(e.target.value));
          }}
          onBlur={() => setText(formatNumberInput(value))}
          className={`w-full text-right p-1.5 border rounded text-sm outline-none transition-colors ${
            error
              ? "border-[#ba1a1a] focus:ring-1 focus:ring-[#ba1a1a]"
              : "border-transparent hover:border-[#717785] focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf]"
          }`}
        />
        <button
          type="button"
          onClick={onToggleType}
          className="w-7 shrink-0 px-1.5 py-1 rounded text-[10px] font-semibold bg-[#ebf5ff] text-[#005baf] hover:bg-[#d9eafa] transition-colors"
        >
          {type === "percent" ? "%" : "đ"}
        </button>
      </div>
      {error && <p className="mt-0.5 text-[11px] text-[#ba1a1a]">{error}</p>}
    </div>
  );
}

export function ProductCell({
  productId,
  productName,
  productSku,
  imageUrl,
  onPick,
  onClear,
  excludeIds,
  error,
}: {
  productId: string;
  productName: string;
  productSku: string;
  imageUrl?: string;
  onPick: (hit: SupplierProductHit) => void;
  onClear: () => void;
  excludeIds?: string[];
  error?: string;
}) {
  if (productId) {
    return (
      <div>
        <div className="flex items-center gap-2 min-w-[260px]">
          <div className="w-8 h-8 rounded bg-[#f4f6f8] flex items-center justify-center overflow-hidden shrink-0">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-4 h-4 rounded-sm bg-[#c0c6d6]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-[#0d1d29] truncate">{productName}</div>
            {productSku && <div className="text-[11px] text-[#404754]">SKU: {productSku}</div>}
          </div>
          <button type="button" onClick={onClear} className="text-[#404754] hover:text-[#ba1a1a] shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        {error && <p className="mt-0.5 text-[11px] text-[#ba1a1a]">{error}</p>}
      </div>
    );
  }
  return (
    <div className="min-w-[260px]">
      <SupplierProductSearch
        onSelect={onPick}
        placeholder="Tìm sản phẩm theo tên hoặc SKU…"
        excludeIds={excludeIds}
        inputClassName="w-full pl-9 pr-3 py-1.5 border border-[#c0c6d6] rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
      />
      {error && <p className="mt-0.5 text-[11px] text-[#ba1a1a]">{error}</p>}
    </div>
  );
}

export function RowDeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[#404754] hover:text-[#ba1a1a] transition-colors p-1 rounded"
      aria-label="Xoá dòng"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

export function AddConditionButton({ onClick, label = "Thêm điều kiện" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#005baf] hover:underline"
    >
      <Plus className="w-4 h-4" />
      {label}
    </button>
  );
}

export function genRowId(): string {
  return `tmp-${Math.random().toString(36).slice(2, 9)}`;
}

export { formatCurrencyVND };
