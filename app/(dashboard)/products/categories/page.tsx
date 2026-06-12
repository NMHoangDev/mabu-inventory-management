"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/providers/AppProvider";
import {
  Plus,
  Search,
  Image as ImageIcon,
  ArrowLeft,
  Trash2,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Globe,
  Loader2,
  Check
} from "lucide-react";
import type { Category } from "@/lib/products/categories";

export default function ProductCategoriesPage() {
  const { setError, setNotice, confirmAction } = useApp();

  // Mode: list vs create
  const [isCreating, setIsCreating] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");

  // Form states for creation
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("manual");
  const [imageUrl, setImageUrl] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [salesChannels, setSalesChannels] = useState<string[]>([]);
  const [themeTemplate, setThemeTemplate] = useState("collection");
  const [showSeoCustom, setShowSeoCustom] = useState(false);

  // Load categories function
  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("Không thể tải danh sách danh mục.");
      const data = await res.json();
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      const matchesSearch = cat.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (cat.description ?? "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === "all" || cat.type === typeFilter;
      const matchesChannel = channelFilter === "all" || (cat.sales_channels ?? []).includes(channelFilter);
      return matchesSearch && matchesType && matchesChannel;
    });
  }, [categories, searchQuery, typeFilter, channelFilter]);

  // Handle submit new category
  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Tên danh mục là bắt buộc.");
      return;
    }

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          type,
          image_url: imageUrl,
          seo_title: seoTitle || name,
          seo_description: seoDescription || description,
          sales_channels: salesChannels,
          theme_template: themeTemplate
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Không thể tạo danh mục.");
      }

      setNotice("Đã thêm danh mục sản phẩm mới!");
      
      // Reset form
      setName("");
      setDescription("");
      setType("manual");
      setImageUrl("");
      setSeoTitle("");
      setSeoDescription("");
      setSalesChannels([]);
      setThemeTemplate("collection");
      setIsCreating(false);
      setShowSeoCustom(false);

      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo danh mục.");
    }
  };

  // Handle Delete category
  const handleDelete = async (id: string, catName: string) => {
    const confirmed = await confirmAction({
      title: `Xóa danh mục "${catName}"?`,
      description: "Hành động này không ảnh hưởng đến các sản phẩm trực thuộc nhưng sẽ xóa liên kết danh mục.",
      confirmLabel: "Xóa danh mục",
      tone: "danger"
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Không thể xóa danh mục.");
      }

      setNotice(`Đã xóa danh mục "${catName}" thành công.`);
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xóa danh mục.");
    }
  };

  const toggleChannel = (channel: string) => {
    setSalesChannels((current) => 
      current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel]
    );
  };

  if (isCreating) {
    return (
      <div className="space-y-6">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b bg-white -mx-6 -mt-6 p-4 px-6 shadow-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsCreating(false)}
              className="p-2 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
              title="Quay lại"
            >
              <ArrowLeft className="h-4 w-4 text-slate-600" />
            </button>
            <h1 className="text-xl font-bold text-slate-800">Thêm danh mục</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsCreating(false)}
              className="px-4 py-2 border rounded-md text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button 
              onClick={handleSubmit}
              disabled={!name.trim()}
              className="px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              Thêm danh mục
            </button>
          </div>
        </div>

        {/* Content form */}
        <div className="max-w-4xl mx-auto grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            {/* General Info */}
            <section className="bg-white rounded-lg border p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Thông tin danh mục</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Tên danh mục <span className="text-destructive">*</span>
                  </label>
                  <input 
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                    placeholder="Ví dụ: Đồ gia dụng, Thời trang nam..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Mô tả</label>
                  <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={6}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                    placeholder="Nhập mô tả chi tiết cho danh mục..."
                  />
                </div>
              </div>
            </section>

            {/* Conditions Selection */}
            <section className="bg-white rounded-lg border p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Điều kiện áp dụng</h2>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="type" 
                    value="manual"
                    checked={type === "manual"}
                    onChange={() => setType("manual")}
                    className="mt-1 h-4 w-4 border-slate-300 text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="block text-sm font-semibold text-slate-700 group-hover:text-primary transition-colors">Thủ công</span>
                    <span className="text-xs text-slate-500">Tự thêm từng sản phẩm vào danh mục này.</span>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="type" 
                    value="auto"
                    checked={type === "auto"}
                    onChange={() => setType("auto")}
                    className="mt-1 h-4 w-4 border-slate-300 text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="block text-sm font-semibold text-slate-700 group-hover:text-primary transition-colors">Tự động</span>
                    <span className="text-xs text-slate-500">Sản phẩm tự động lọt vào danh mục dựa trên các điều kiện lọc (ví dụ: cùng Tag).</span>
                  </div>
                </label>
              </div>
            </section>

            {/* SEO Section */}
            <section className="bg-white rounded-lg border p-6 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Tối ưu SEO</h2>
                <button 
                  type="button" 
                  onClick={() => setShowSeoCustom(!showSeoCustom)}
                  className="text-primary text-xs font-semibold hover:underline"
                >
                  {showSeoCustom ? "Đóng tùy chỉnh" : "Tùy chỉnh SEO"}
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-4">Thiết lập các mô tả chuẩn hóa giúp khách hàng dễ dàng tìm kiếm thấy nhóm hàng trên Google.</p>
              
              {showSeoCustom ? (
                <div className="space-y-4 pt-2 border-t">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tiêu đề SEO</label>
                    <input 
                      type="text"
                      value={seoTitle}
                      onChange={(e) => setSeoTitle(e.target.value)}
                      placeholder={name || "Tiêu đề mặc định"}
                      className="w-full border rounded-md px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Mô tả SEO</label>
                    <textarea 
                      value={seoDescription}
                      onChange={(e) => setSeoDescription(e.target.value)}
                      placeholder={description || "Mô tả SEO mặc định"}
                      rows={3}
                      className="w-full border rounded-md px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded bg-slate-50 p-3 text-xs border border-dashed">
                  <div className="font-semibold text-blue-700 truncate">{seoTitle || name || "Chưa có tiêu đề SEO"}</div>
                  <div className="text-emerald-700 text-[10px] mt-0.5 font-medium">https://sapo.vn/collections/{name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : ""}</div>
                  <div className="text-slate-600 mt-1 line-clamp-2">{seoDescription || description || "Chưa có mô tả SEO."}</div>
                </div>
              )}
            </section>
          </div>

          {/* Right Column sidebar */}
          <div className="space-y-6">
            {/* Image Upload */}
            <section className="bg-white rounded-lg border p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Ảnh danh mục</h2>
              <div className="space-y-3">
                <div className="border border-dashed rounded-lg p-4 flex flex-col items-center justify-center bg-slate-50">
                  {imageUrl ? (
                    <div className="relative group w-full aspect-video rounded overflow-hidden border">
                      <img src={imageUrl} alt="Category preview" className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={() => setImageUrl("")}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold"
                      >
                        Xóa ảnh
                      </button>
                    </div>
                  ) : (
                    <>
                      <ImageIcon className="h-8 w-8 text-slate-400 mb-1" />
                      <span className="text-[11px] text-slate-500 text-center">Chưa có ảnh. Gán ảnh trực tiếp từ liên kết URL bên dưới.</span>
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Đường dẫn ảnh (URL)</label>
                  <input 
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="w-full border rounded-md px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </section>

            {/* Sales Channels */}
            <section className="bg-white rounded-lg border p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Kênh bán hàng</h2>
              <div className="space-y-2">
                {[
                  { key: "pos", label: "Tại cửa hàng (POS)" },
                  { key: "web", label: "Website" },
                  { key: "tiki", label: "Tiki" },
                  { key: "shopee", label: "Shopee" },
                  { key: "lazada", label: "Lazada" },
                  { key: "tiktok", label: "TikTok Shop" }
                ].map((channel) => {
                  const active = salesChannels.includes(channel.key);
                  return (
                    <button
                      key={channel.key}
                      type="button"
                      onClick={() => toggleChannel(channel.key)}
                      className={`w-full flex items-center justify-between border rounded-md px-3 py-2 text-xs transition-all ${
                        active 
                          ? "border-primary bg-primary/5 text-primary font-semibold"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span>{channel.label}</span>
                      {active && <Check className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Theme template */}
            <section className="bg-white rounded-lg border p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Giao diện danh mục</h2>
              <select 
                value={themeTemplate}
                onChange={(e) => setThemeTemplate(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary bg-white"
              >
                <option value="collection">Mẫu danh mục chuẩn (collection)</option>
                <option value="landing">Trang đáp quảng cáo (landing-page)</option>
                <option value="custom">Tùy biến khác (custom)</option>
              </select>
            </section>
          </div>
        </div>

        {/* Bottom save bar */}
        <div className="flex justify-end pt-4 border-t gap-2 max-w-4xl mx-auto pb-10">
          <button 
            type="button"
            onClick={() => setIsCreating(false)}
            className="px-5 py-2 border rounded-md text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Hủy
          </button>
          <button 
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="px-6 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow"
          >
            Lưu danh mục
          </button>
        </div>
      </div>
    );
  }

  // Categories list rendering
  return (
    <section className="space-y-5">
      {/* Top action header */}
      <div className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Danh mục</div>
            <h2 className="mt-1 text-2xl font-semibold">Danh mục sản phẩm</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Phân loại danh mục giúp bạn cấu trúc sản phẩm mạch lạc hơn để quản lý tồn kho và đồng bộ đa kênh.
            </p>
          </div>
          <button 
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 shadow-soft"
          >
            <Plus className="h-4 w-4" />
            Thêm danh mục
          </button>
        </div>
      </div>

      {/* Main card database container */}
      <div className="panel overflow-hidden">
        {/* Tabs header */}
        <div className="border-b px-4">
          <div className="flex">
            <button className="px-4 py-3 text-sm font-semibold border-b-2 border-primary text-primary">
              Tất cả danh mục ({filteredCategories.length})
            </button>
          </div>
        </div>

        {/* Filters and search area */}
        <div className="p-4 border-b flex flex-wrap items-center gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="h-4 w-4" />
            </span>
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm danh mục sản phẩm..."
              className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-md text-sm outline-none bg-white focus:ring-1 focus:ring-primary"
            />
          </div>

          <select 
            value={typeFilter} 
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">Mọi điều kiện</option>
            <option value="manual">Thủ công</option>
            <option value="auto">Tự động</option>
          </select>

          <select 
            value={channelFilter} 
            onChange={(e) => setChannelFilter(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">Mọi kênh bán hàng</option>
            <option value="pos">Tại cửa hàng (POS)</option>
            <option value="web">Website</option>
            <option value="shopee">Shopee</option>
            <option value="lazada">Lazada</option>
            <option value="tiki">Tiki</option>
            <option value="tiktok">TikTok Shop</option>
          </select>

          {(searchQuery || typeFilter !== "all" || channelFilter !== "all") && (
            <button 
              onClick={() => {
                setSearchQuery("");
                setTypeFilter("all");
                setChannelFilter("all");
              }}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Thiết lập lại
            </button>
          )}
        </div>

        {/* Table data */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center p-12 gap-2 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Đang tải danh sách danh mục...
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center p-12 text-slate-500 space-y-2">
              <p>Không tìm thấy danh mục sản phẩm nào phù hợp.</p>
              <button 
                onClick={() => setIsCreating(true)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Tạo mới danh mục đầu tiên
              </button>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="w-12 px-4 py-3">
                    <input type="checkbox" className="rounded border-slate-300 text-primary focus:ring-primary" disabled />
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">Danh mục</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">Loại điều kiện</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs text-right">Số lượng sản phẩm</th>
                  <th className="w-20 px-4 py-3 text-center font-semibold text-slate-500 uppercase tracking-wider text-xs">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4">
                      <input type="checkbox" className="rounded border-slate-300 text-primary focus:ring-primary" disabled />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 border rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                          {cat.image_url ? (
                            <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-primary hover:underline cursor-pointer">
                            {cat.name}
                          </span>
                          {cat.description && (
                            <p className="text-xs text-slate-400 line-clamp-1 max-w-sm mt-0.5">{cat.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        cat.type === "auto" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"
                      }`}>
                        {cat.type === "auto" ? "Tự động" : "Thủ công"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-medium tabular-nums text-slate-600">
                      {cat.product_count ?? 0} sản phẩm
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button 
                        onClick={() => handleDelete(cat.id, cat.name)}
                        className="rounded-lg p-2 text-red-600 hover:bg-red-50 transition-colors"
                        title="Xóa danh mục này"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info pagination */}
        <div className="px-4 py-4 border-t flex items-center justify-between text-xs text-slate-500 bg-slate-50/20">
          <div>
            Hiển thị 1 đến {filteredCategories.length} trên tổng {filteredCategories.length} kết quả
          </div>
          <div className="flex items-center gap-2">
            <button className="w-7 h-7 flex items-center justify-center rounded border bg-white cursor-not-allowed opacity-50">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button className="w-7 h-7 flex items-center justify-center bg-primary text-white rounded font-semibold text-xs">
              1
            </button>
            <button className="w-7 h-7 flex items-center justify-center rounded border bg-white cursor-not-allowed opacity-50">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-slate-400">
        Tìm hiểu thêm về{" "}
        <a href="#" className="text-primary hover:underline inline-flex items-center gap-0.5">
          danh mục sản phẩm <HelpCircle className="h-3 w-3" />
        </a>
      </div>
    </section>
  );
}
