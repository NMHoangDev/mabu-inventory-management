"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, Package } from "lucide-react";

export interface SupplierProductHit {
  id: string;
  name: string;
  sku: string;
  unit: string;
  price: number;
  image_url: string;
}

interface SupplierProductSearchProps {
  onSelect: (hit: SupplierProductHit) => void;
  placeholder?: string;
  /** Sản phẩm đã chọn rồi — ẩn khỏi kết quả để tránh chọn trùng. */
  excludeIds?: string[];
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

/**
 * Ô tìm sản phẩm dùng chung cho các trang nhà cung cấp — tái sử dụng thẳng
 * /api/orders/search-products (unaccent + trigram + ranking, không phụ thuộc
 * gì vào đơn hàng) để có chất lượng tìm kiếm giống trang tạo đơn hàng.
 */
export function SupplierProductSearch({
  onSelect,
  placeholder,
  excludeIds,
  className,
  inputClassName,
  autoFocus
}: SupplierProductSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SupplierProductHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/orders/search-products?q=${encodeURIComponent(query)}&limit=10`)
        .then(async (r) => {
          const d = await r.json().catch(() => null);
          if (!r.ok) throw new Error(d?.error ?? "Không tìm được sản phẩm.");
          return d;
        })
        .then((d) => {
          if (!cancelled) setResults(Array.isArray(d?.products) ? d.products : []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const visible = results.filter((r) => !excludeIds?.includes(r.id));

  return (
    <div className={`relative ${className ?? ""}`} ref={boxRef}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
        <Search className="w-4 h-4" />
      </span>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoFocus={autoFocus}
        placeholder={placeholder ?? "Tìm theo tên sản phẩm hoặc mã SKU..."}
        className={
          inputClassName ??
          "w-full pl-10 pr-4 py-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
        }
      />
      {open && query.trim() ? (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded shadow-lg z-20 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-sm text-slate-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Đang tìm…
            </div>
          ) : visible.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-500">Không tìm thấy sản phẩm nào.</div>
          ) : (
            visible.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onSelect(p);
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2"
              >
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-9 h-9 object-cover rounded border flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 bg-slate-100 rounded border flex items-center justify-center text-slate-300 flex-shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium text-slate-800">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    SKU: {p.sku || "—"} · {fmtMoney.format(p.price)}đ
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
