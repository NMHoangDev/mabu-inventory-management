"use client";

// app/products/page.tsx
// Trang danh sách sản phẩm: bộ lọc danh mục dạng chip ngang (kiểu Shopee) + dropdown giá + sắp xếp

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontal, X, SearchX, ChevronDown } from "lucide-react";
import { products, categories } from "@/data/mockData";
import ProductCard from "@/components/ProductCard";

type SortOption = "newest" | "price-asc" | "price-desc" | "rating";

const priceRanges = [
  { id: "under-100k", label: "Dưới 100.000đ", min: 0, max: 100000 },
  { id: "100k-200k", label: "100.000đ - 200.000đ", min: 100000, max: 200000 },
  { id: "200k-300k", label: "200.000đ - 300.000đ", min: 200000, max: 300000 },
  { id: "above-300k", label: "Trên 300.000đ", min: 300000, max: Infinity },
];

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsPageContent />
    </Suspense>
  );
}

function ProductsPageContent() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") || "";
  const query = (searchParams.get("q") || "").trim().toLowerCase();

  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialCategory ? [initialCategory] : []
  );
  const [selectedPriceRanges, setSelectedPriceRanges] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [priceDropdownOpen, setPriceDropdownOpen] = useState(false);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const togglePriceRange = (id: string) => {
    setSelectedPriceRanges((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedPriceRanges([]);
  };

  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (query) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query)
      );
    }

    if (selectedCategories.length > 0) {
      result = result.filter((p) => selectedCategories.includes(p.category));
    }

    if (selectedPriceRanges.length > 0) {
      result = result.filter((p) => {
        const ranges = priceRanges.filter((r) => selectedPriceRanges.includes(r.id));
        return ranges.some((r) => p.price >= r.min && p.price < r.max);
      });
    }

    switch (sortBy) {
      case "price-asc":
        result.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        result.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        result.sort((a, b) => b.rating - a.rating);
        break;
      default:
        result.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    }

    return result;
  }, [selectedCategories, selectedPriceRanges, sortBy, query]);

  const activeFilterCount = selectedCategories.length + selectedPriceRanges.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-[#1A365D]">
          {query ? `Kết quả cho "${query}"` : "Tất Cả Sản Phẩm"}
        </h1>
        <p className="text-gray-500 mt-1.5 text-sm">
          {filteredProducts.length} sản phẩm được tìm thấy
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <button
                onClick={clearFilters}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                  selectedCategories.length === 0
                    ? "bg-[#1A365D] text-white border-[#1A365D]"
                    : "bg-white text-gray-600 border-gray-200 hover:border-[#1A365D]/40"
                }`}
              >
                Tất cả
              </button>
              {categories.map((cat) => {
                const isActive = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border whitespace-nowrap transition-colors ${
                      isActive
                        ? "bg-[#1A365D] text-white border-[#1A365D]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-[#1A365D]/40"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                onClick={() => setPriceDropdownOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                  selectedPriceRanges.length > 0
                    ? "bg-[#1A365D]/5 text-[#1A365D] border-[#1A365D]/30"
                    : "bg-white text-gray-600 border-gray-200"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Khoảng giá
                {selectedPriceRanges.length > 0 && ` (${selectedPriceRanges.length})`}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {priceDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPriceDropdownOpen(false)} />
                  <div className="absolute right-0 sm:left-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-100 shadow-lg z-20 p-3">
                    {priceRanges.map((range) => (
                      <label
                        key={range.id}
                        className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-[#F7FAFC] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPriceRanges.includes(range.id)}
                          onChange={() => togglePriceRange(range.id)}
                          className="w-4 h-4 rounded border-gray-300 text-[#1A365D] focus:ring-[#1A365D]/30"
                        />
                        <span className="text-sm text-gray-700">{range.label}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3.5 py-2 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A365D]/20"
            >
              <option value="newest">Mới nhất</option>
              <option value="price-asc">Giá: Thấp đến cao</option>
              <option value="price-desc">Giá: Cao đến thấp</option>
              <option value="rating">Đánh giá cao nhất</option>
            </select>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">Đang lọc:</span>
            {selectedCategories.map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1A365D]/5 text-[#1A365D] text-xs font-medium"
              >
                {cat}
                <button onClick={() => toggleCategory(cat)}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {selectedPriceRanges.map((id) => {
              const range = priceRanges.find((r) => r.id === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1A365D]/5 text-[#1A365D] text-xs font-medium"
                >
                  {range?.label}
                  <button onClick={() => togglePriceRange(id)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            <button
              onClick={clearFilters}
              className="text-xs font-medium text-[#C9A24B] hover:text-[#a9853a] ml-1"
            >
              Xóa tất cả
            </button>
          </div>
        )}
      </div>

      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
          <SearchX className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Không tìm thấy sản phẩm phù hợp.</p>
          <button
            onClick={clearFilters}
            className="mt-3 text-sm font-medium text-[#1A365D] hover:text-[#C9A24B]"
          >
            Xóa bộ lọc
          </button>
        </div>
      )}
    </div>
  );
}