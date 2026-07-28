"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgePercent,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { PromotionTypePickerModal } from "@/components/promotions/PromotionTypePickerModal";
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { PageGuard } from "@/components/auth/PageGuard";
import {
  PROMOTION_METHOD_LABELS,
  PROMOTION_STATUS_CLASSES,
  PROMOTION_STATUS_LABELS,
  type PromotionDisplayStatus,
  type PromotionListRow,
} from "@/lib/promotions/types";

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

export default function PromotionsPage() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [rows, setRows] = useState<PromotionListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tab, setTab] = useState<"all" | "running">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPromotions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), tab });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (tab !== "running" && statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/promotions?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tải được danh sách.");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error(e);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, tab, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, total);

  const statusOptions = [
    { v: "all", l: "Tất cả" },
    { v: "draft", l: "Nháp" },
    { v: "active", l: "Đang áp dụng" },
    { v: "paused", l: "Tạm dừng" },
    { v: "ended", l: "Đã kết thúc" },
  ];

  return (
    <PageGuard permission="promotions.view">
    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#f4f6f8]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0d1d29]">Khuyến mại</h1>
          <p className="text-sm text-[#404754] mt-0.5">
            Cấu hình chương trình chiết khấu, hệ thống sẽ gợi ý khi tạo đơn hàng.
          </p>
        </div>
        {hasPermission("promotions.create") ? (
          <button
            onClick={() => setTypePickerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#005baf] text-white font-bold rounded-lg hover:bg-[#005eb3] transition-all shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span>Tạo khuyến mại</span>
          </button>
        ) : null}
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-[#c0c6d6] rounded-xl p-4 flex flex-wrap gap-4 items-center shadow-sm">
        <div className="flex-1 min-w-[300px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#404754] w-5 h-5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#f4f6f8] border border-[#c0c6d6] rounded-lg text-sm focus:ring-2 focus:ring-[#005baf] focus:border-[#005baf] outline-none transition-all"
            placeholder="Tìm kiếm theo mã, tên khuyến mại"
            type="text"
          />
        </div>
        <div className={tab === "running" ? "opacity-60 pointer-events-none" : ""}>
          <FilterDropdown
            icon={<Filter className="w-5 h-5" />}
            label={
              tab === "running"
                ? "Trạng thái: Đang chạy"
                : statusFilter === "all"
                  ? "Trạng thái"
                  : statusOptions.find((o) => o.v === statusFilter)?.l ?? "Trạng thái"
            }
            options={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#c0c6d6]">
        <TabButton active={tab === "all"} onClick={() => setTab("all")} label="Tất cả" />
        <TabButton active={tab === "running"} onClick={() => setTab("running")} label="Đang chạy" />
      </div>

      {/* Table */}
      <div className="bg-white border border-[#c0c6d6] rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-[#ebf5ff] border-b border-[#c0c6d6]">
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Mã</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Tên chương trình</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Loại khuyến mại</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase text-right">Số phiếu còn lại</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Ngày bắt đầu</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Ngày kết thúc</th>
                <th className="p-4 text-xs font-semibold text-[#404754] uppercase">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c0c6d6]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#005baf] mx-auto" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <BadgePercent className="w-10 h-10 text-[#c0c6d6] mx-auto mb-3" />
                    <p className="text-sm text-[#404754]">Chưa có chương trình khuyến mại nào.</p>
                    {hasPermission("promotions.create") ? (
                      <button
                        onClick={() => setTypePickerOpen(true)}
                        className="mt-3 text-sm font-semibold text-[#005baf] hover:underline"
                      >
                        Tạo khuyến mại đầu tiên
                      </button>
                    ) : null}
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/promotions/${p.id}`)}
                    className="hover:bg-[#ebf5ff] transition-colors cursor-pointer"
                  >
                    <td className="p-4">
                      <span className="text-[#005baf] font-bold text-sm hover:underline">{p.code}</span>
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-medium text-[#0d1d29]">{p.name}</div>
                      {p.rule_summary && (
                        <div className="text-[11px] text-[#404754] mt-0.5">{p.rule_summary}</div>
                      )}
                    </td>
                    <td className="p-4 text-xs text-[#404754]">{PROMOTION_METHOD_LABELS[p.method]}</td>
                    <td className="p-4 text-sm text-[#0d1d29] text-right tabular-nums">
                      {p.remaining === null ? "∞" : p.remaining}
                    </td>
                    <td className="p-4 text-xs text-[#404754]">{fmtDateTime(p.starts_at)}</td>
                    <td className="p-4 text-xs text-[#404754]">
                      {p.ends_at ? fmtDateTime(p.ends_at) : "không giới hạn"}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 rounded-full text-[11px] font-bold ${PROMOTION_STATUS_CLASSES[p.display_status as PromotionDisplayStatus]}`}
                      >
                        {PROMOTION_STATUS_LABELS[p.display_status as PromotionDisplayStatus]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-[#ebf5ff] flex items-center justify-between border-t border-[#c0c6d6] flex-wrap gap-3">
          <span className="text-xs text-[#404754]">
            Hiển thị {startIdx} - {endIdx} trong tổng số {total} chương trình
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="p-1.5 rounded border border-[#c0c6d6] bg-white disabled:opacity-40 hover:bg-[#f4f6f8]"
            >
              <ChevronLeft className="w-4 h-4 text-[#404754]" />
            </button>
            <PageButton page={safePage} />
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="p-1.5 rounded border border-[#c0c6d6] bg-white disabled:opacity-40 hover:bg-[#f4f6f8]"
            >
              <ChevronRight className="w-4 h-4 text-[#404754]" />
            </button>
            <span className="text-xs text-[#404754] ml-2">Hiển thị</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="border border-[#c0c6d6] rounded px-2 py-1 text-xs bg-white"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {typePickerOpen && <PromotionTypePickerModal onClose={() => setTypePickerOpen(false)} />}
    </div>
    </PageGuard>
  );
}

// ─── Helper cục bộ ──────────────────────────────────────────────────────────
// Chép từ app/(dashboard)/orders/page.tsx (FilterDropdown/TabButton/PageButton là
// local, KHÔNG export). Cố ý không refactor sang components/shared/ trong lần này
// để không phải đụng vào trang orders — đó là việc dọn dẹp riêng.

function FilterDropdown({
  icon,
  label,
  options,
  value,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  options?: { v: string; l: string }[];
  value?: string;
  onChange?: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-[#c0c6d6] rounded-lg text-sm text-[#404754] hover:border-[#005baf] transition-all"
      >
        {icon}
        <span>{label}</span>
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && options && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 min-w-[200px] bg-white border border-[#c0c6d6] rounded-lg shadow-lg py-1">
            {options.map((o) => (
              <button
                key={o.v}
                onClick={() => {
                  onChange?.(o.v);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#ebf5ff] ${value === o.v ? "text-[#005baf] font-semibold" : "text-[#404754]"}`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
        active ? "border-[#005baf] text-[#005baf]" : "border-transparent text-[#404754] hover:text-[#0d1d29]"
      }`}
    >
      {label}
    </button>
  );
}

function PageButton({ page }: { page: number }) {
  return (
    <span className="px-3 py-1 rounded bg-[#005baf] text-white text-xs font-bold">{page}</span>
  );
}
