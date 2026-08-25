"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Plus,
  X,
  Loader2,
  Package,
  Filter,
  Upload,
  AlertTriangle
} from "lucide-react";
import { PageGuard } from "@/components/auth/PageGuard";

interface SystemStockRow {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  system_quantity: number;
}

interface DraftItem {
  rowKey: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  unit: string;
  image_url: string;
  system_quantity: number;
  actual_quantity: number;
  variance_reason: string;
  note: string;
  /** Giá vốn hệ thống hiện tại / giá vốn đọc từ file nhập (0 = không có dữ
   * liệu, vd item thêm tay qua ô tìm kiếm chứ không phải từ file Excel). */
  system_cost_price: number;
  file_cost_price: number;
}

type TabKey = "all" | "pending" | "matched" | "variance";

interface UnmatchedImportRow {
  sku: string;
  actual_quantity: number;
}

interface ToCreateImportRow {
  sku: string;
  product_name: string;
  unit: string;
  actual_quantity: number;
  cost_price: number;
}

interface CostPriceFixRow {
  product_id: string;
  sku: string;
  product_name: string;
  system_cost_price: number;
  file_cost_price: number;
}

const emptyItem = (): DraftItem => ({
  rowKey: `tmp-${Math.random().toString(36).slice(2, 9)}`,
  product_id: null,
  sku: "",
  product_name: "",
  unit: "",
  image_url: "",
  system_quantity: 0,
  actual_quantity: 0,
  variance_reason: "",
  note: "",
  system_cost_price: 0,
  file_cost_price: 0
});

function parseNumberInput(text: string): number {
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

const VARIANCE_REASONS = [
  "Hàng hư/hỏng",
  "Hàng thất thoát",
  "Nhập thiếu trước đó",
  "Xuất nhầm",
  "Sai số kiểm đếm",
  "Khác"
];

export default function NewStockCheckPage() {
  const router = useRouter();

  const [code, setCode] = useState("KTH00001");
  const [codeLoading, setCodeLoading] = useState(true);
  const [branch, setBranch] = useState("Chi nhánh mặc định");
  const [staff, setStaff] = useState("");
  const [staffOptions, setStaffOptions] = useState<{ id: string; full_name: string }[]>([]);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [systemStock, setSystemStock] = useState<SystemStockRow[]>([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [multiSelect, setMultiSelect] = useState(false);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<TabKey>("all");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [unmatchedSkus, setUnmatchedSkus] = useState<UnmatchedImportRow[]>([]);
  const [pendingCreate, setPendingCreate] = useState<ToCreateImportRow[]>([]);
  const [costPriceFixes, setCostPriceFixes] = useState<CostPriceFixRow[]>([]);
  const productBoxRef = useRef<HTMLDivElement | null>(null);
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch("/api/staff")
      .then((r) => r.json())
      .then((d) => setStaffOptions(Array.isArray(d?.staff) ? d.staff : []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCodeLoading(true);
    fetch("/api/stock-checks/next-code")
      .then((r) => r.json())
      .then((data) => !cancelled && data?.code && setCode(data.code))
      .catch(() => undefined)
      .finally(() => !cancelled && setCodeLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStockLoading(true);
    fetch("/api/stock-checks/system-stock")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        // Không auto-fill toàn bộ sản phẩm vào phiếu — để trống, người dùng tự
        // tìm/chọn sản phẩm muốn kiểm (xem ô tìm kiếm bên dưới). Trước đây auto-fill
        // hết khiến ô tìm kiếm luôn trả về rỗng (mọi sản phẩm đã "có sẵn" trong
        // phiếu) nên không thể chọn thêm được.
        if (Array.isArray(data)) setSystemStock(data);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi mạng."))
      .finally(() => !cancelled && setStockLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (productBoxRef.current && !productBoxRef.current.contains(event.target as Node)) {
        setProductQuery("");
        setMultiSelect(false);
        setMultiSelected(new Set());
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const counts = useMemo(() => {
    const c = { all: 0, pending: 0, matched: 0, variance: 0 };
    for (const it of items) {
      c.all += 1;
      if (it.actual_quantity === 0) c.pending += 1;
      else if (Math.abs(it.actual_quantity - it.system_quantity) < 1e-6) c.matched += 1;
      else c.variance += 1;
    }
    return c;
  }, [items]);

  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      if (tab === "all") return true;
      if (tab === "pending") return it.actual_quantity === 0;
      if (tab === "matched")
        return Math.abs(it.actual_quantity - it.system_quantity) < 1e-6;
      if (tab === "variance")
        return Math.abs(it.actual_quantity - it.system_quantity) >= 1e-6;
      return true;
    });
  }, [items, tab]);

  const productResults = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const available = systemStock.filter(
      (row) => !items.some((it) => it.product_id === row.product_id)
    );
    // Chế độ chọn nhiều: cho phép duyệt cả khi chưa gõ gì (tối đa 30 dòng) để
    // "thêm nhanh" nhiều sản phẩm cùng lúc. Chế độ thường: bắt buộc gõ tìm kiếm.
    if (!q) return multiSelect ? available.slice(0, 30) : [];
    return available
      .filter(
        (row) =>
          row.product_name.toLowerCase().includes(q) ||
          row.sku.toLowerCase().includes(q) ||
          (row.unit ?? "").toLowerCase().includes(q)
      )
      .slice(0, multiSelect ? 30 : 10);
  }, [productQuery, systemStock, items, multiSelect]);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.rowKey === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.rowKey !== key));
  }

  function rowToDraftItem(row: SystemStockRow): DraftItem {
    return {
      rowKey: `add-${row.product_id}-${Math.random().toString(36).slice(2, 7)}`,
      product_id: row.product_id,
      sku: row.sku,
      product_name: row.product_name,
      unit: row.unit,
      image_url: row.image_url,
      system_quantity: Number(row.system_quantity) || 0,
      actual_quantity: 0,
      variance_reason: "",
      note: "",
      system_cost_price: 0,
      file_cost_price: 0
    };
  }

  function addProductToCheck(row: SystemStockRow) {
    setItems((prev) => [...prev, rowToDraftItem(row)]);
    setProductQuery("");
  }

  function openMultiSelect() {
    setMultiSelect(true);
    setMultiSelected(new Set());
    productInputRef.current?.focus();
  }

  function toggleMultiSelected(productId: string) {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleSelectAllResults() {
    setMultiSelected((prev) => {
      if (productResults.every((r) => prev.has(r.product_id))) return new Set();
      return new Set(productResults.map((r) => r.product_id));
    });
  }

  function commitMultiSelect() {
    const rows = systemStock.filter((r) => multiSelected.has(r.product_id));
    if (rows.length > 0) {
      setItems((prev) => [...prev, ...rows.map(rowToDraftItem)]);
    }
    setMultiSelect(false);
    setMultiSelected(new Set());
    setProductQuery("");
  }

  function openImportFile() {
    importInputRef.current?.click();
  }

  // Nhập file "Báo cáo tồn kho" xuất từ hệ thống bán hàng (Sapo) — quét cột
  // Mã SKU + Tồn kho, khớp với sản phẩm trong hệ thống, đổ vào phiếu kiểm để
  // người dùng REVIEW trước khi "Cân bằng kho" (không tự động ghi tồn kho
  // ngay khi nhập file — an toàn hơn vì đây là dữ liệu ngoài, có thể sai SKU).
  async function handleImportFile(file: File) {
    setImporting(true);
    setError("");
    setNotice("");
    setUnmatchedSkus([]);
    setPendingCreate([]);
    setCostPriceFixes([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/stock-checks/import-excel", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không nhập được file.");

      const incoming: Array<{
        product_id: string;
        sku: string;
        product_name: string;
        unit: string;
        image_url: string;
        system_quantity: number;
        actual_quantity: number;
        system_cost_price: number;
        file_cost_price: number;
      }> = Array.isArray(data.items) ? data.items : [];

      setItems((prev) => {
        const next = [...prev];
        for (const row of incoming) {
          const idx = next.findIndex((it) => it.product_id === row.product_id);
          if (idx !== -1) {
            next[idx] = {
              ...next[idx],
              system_quantity: row.system_quantity,
              actual_quantity: row.actual_quantity,
              system_cost_price: row.system_cost_price,
              file_cost_price: row.file_cost_price
            };
          } else {
            next.push({
              rowKey: `import-${row.product_id}`,
              product_id: row.product_id,
              sku: row.sku,
              product_name: row.product_name,
              unit: row.unit,
              image_url: row.image_url,
              system_quantity: row.system_quantity,
              actual_quantity: row.actual_quantity,
              variance_reason: "",
              note: "",
              system_cost_price: row.system_cost_price,
              file_cost_price: row.file_cost_price
            });
          }
        }
        return next;
      });

      if (Array.isArray(data.unmatched)) setUnmatchedSkus(data.unmatched);
      if (Array.isArray(data.toCreate)) {
        const incomingToCreate: ToCreateImportRow[] = data.toCreate;
        setPendingCreate((prev) => {
          const next = [...prev];
          for (const row of incomingToCreate) {
            const idx = next.findIndex((r) => r.sku.toLowerCase() === row.sku.toLowerCase());
            if (idx !== -1) next[idx] = row;
            else next.push(row);
          }
          return next;
        });
      }

      // Lệch giá vốn: chỉ tính khi file CÓ giá vốn thật (>0) và khác giá vốn
      // hệ thống — sẽ tự cập nhật khi bấm "Tạo phiếu kiểm"/"Cân bằng kho".
      const fixes: CostPriceFixRow[] = incoming
        .filter((row) => row.file_cost_price > 0 && Math.abs(row.file_cost_price - row.system_cost_price) > 0.01)
        .map((row) => ({
          product_id: row.product_id,
          sku: row.sku,
          product_name: row.product_name,
          system_cost_price: row.system_cost_price,
          file_cost_price: row.file_cost_price
        }));
      setCostPriceFixes((prev) => {
        const next = [...prev];
        for (const row of fixes) {
          const idx = next.findIndex((r) => r.product_id === row.product_id);
          if (idx !== -1) next[idx] = row;
          else next.push(row);
        }
        return next;
      });

      const s = data.summary ?? {};
      const parts = [`Đã nhập file: ${s.matched ?? incoming.length}/${s.totalRows ?? incoming.length} SKU khớp hệ thống`];
      if (s.toCreate) parts.push(`${s.toCreate} SKU mới sẽ được tạo khi bạn lưu phiếu`);
      if (s.costPriceMismatch) parts.push(`${s.costPriceMismatch} SKU sẽ cập nhật lại giá vốn theo file`);
      if (s.unmatched) parts.push(`${s.unmatched} SKU không đủ dữ liệu để tạo (thiếu tên)`);
      if (s.duplicateInFile) parts.push(`${s.duplicateInFile} SKU lặp trong file (đã gộp, lấy dòng cuối)`);
      setNotice(parts.join(", ") + ".");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi nhập file.");
    } finally {
      setImporting(false);
    }
  }

  function handleAddTag() {
    const value = tagInput.trim();
    if (!value) return;
    if (!tags.includes(value)) setTags((prev) => [...prev, value]);
    setTagInput("");
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  }

  async function handleSubmit(action: "save" | "balance") {
    if (items.length === 0 && pendingCreate.length === 0) {
      setError("Vui lòng thêm ít nhất một sản phẩm vào phiếu kiểm.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      let allItems = items;

      // Nếu có SKU từ file nhập chưa tồn tại trong hệ thống, và/hoặc có SKU
      // đã tồn tại nhưng giá vốn trong file khác giá vốn hệ thống → xử lý
      // NGAY LÚC NÀY (người dùng vừa bấm lưu/cân bằng — hành động xác nhận
      // rõ ràng). Không tạo/sửa ở bước preview/nhập file để còn cơ hội
      // review trước khi ghi dữ liệu.
      if (pendingCreate.length > 0 || costPriceFixes.length > 0) {
        const createRes = await fetch("/api/stock-checks/import-excel/create-missing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: pendingCreate,
            costPriceUpdates: costPriceFixes.map((f) => ({
              product_id: f.product_id,
              cost_price: f.file_cost_price
            }))
          })
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData?.error ?? "Không tạo được sản phẩm mới.");

        const createdList: Array<{
          product_id: string;
          sku: string;
          product_name: string;
          unit: string;
          actual_quantity: number;
        }> = Array.isArray(createData.created) ? createData.created : [];
        const costPriceUpdatedList: Array<{ product_id: string; cost_price: number }> = Array.isArray(
          createData.costPriceUpdated
        )
          ? createData.costPriceUpdated
          : [];
        const costPriceByProductId = new Map(costPriceUpdatedList.map((r) => [r.product_id, r.cost_price]));

        const createdItems: DraftItem[] = createdList.map((row) => {
          const pendingRow = pendingCreate.find((p) => p.sku.toLowerCase() === row.sku.toLowerCase());
          return {
            rowKey: `created-${row.product_id}`,
            product_id: row.product_id,
            sku: row.sku,
            product_name: row.product_name,
            unit: row.unit,
            image_url: "",
            system_quantity: 0,
            actual_quantity: row.actual_quantity,
            variance_reason: "",
            note: "",
            system_cost_price: pendingRow?.cost_price ?? 0,
            file_cost_price: pendingRow?.cost_price ?? 0
          };
        });
        allItems = [
          ...items.map((it) =>
            it.product_id && costPriceByProductId.has(it.product_id)
              ? { ...it, system_cost_price: costPriceByProductId.get(it.product_id)! }
              : it
          ),
          ...createdItems
        ];
        setItems(allItems);
        setCostPriceFixes((prev) => prev.filter((f) => !costPriceByProductId.has(f.product_id)));

        const createdSkus = new Set(createdList.map((r) => r.sku.toLowerCase()));
        const remainingPending = pendingCreate.filter((r) => !createdSkus.has(r.sku.toLowerCase()));
        setPendingCreate(remainingPending);

        const createErrors: Array<{ sku: string; message: string }> = Array.isArray(createData.errors)
          ? createData.errors
          : [];
        if (createErrors.length > 0) {
          // Dừng lại để người dùng thấy lỗi trước khi tiếp tục — các sản phẩm
          // tạo thành công đã được gộp vào items (không mất), chỉ những SKU
          // lỗi còn nằm lại trong pendingCreate để thử lại.
          setError(
            `Không tạo được ${createErrors.length} sản phẩm (SKU: ${createErrors
              .map((e) => e.sku)
              .join(", ")}). Các sản phẩm còn lại đã được thêm vào phiếu — bấm lại để tiếp tục lưu, hoặc xoá SKU lỗi khỏi danh sách nhập.`
          );
          return;
        }
      }

      const res = await fetch("/api/stock-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim() || undefined,
          branch,
          staff,
          note,
          tags,
          status: action === "balance" ? "balanced" : "draft",
          items: allItems.map((it, idx) => ({
            product_id: it.product_id,
            sku: it.sku,
            product_name: it.product_name,
            unit: it.unit,
            image_url: it.image_url,
            system_quantity: it.system_quantity,
            actual_quantity: it.actual_quantity,
            variance: it.actual_quantity - it.system_quantity,
            variance_reason: it.variance_reason,
            note: it.note,
            position: idx + 1
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không tạo được phiếu kiểm.");
      setNotice(`Đã tạo phiếu kiểm ${data.code}.`);
      router.push(`/products/stock-checks/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi tạo phiếu kiểm.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageGuard permission="stock_checks.create">
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6 bg-slate-100">
      <header className="h-14 bg-white border-b px-6 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => router.push("/products/stock-checks")}
          className="flex items-center gap-2 text-[15px] text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft className="w-4 h-4" /> Tạo phiếu kiểm hàng
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/products/stock-checks")}
            className="px-5 py-2 border border-blue-600 text-blue-600 rounded text-sm font-medium hover:bg-blue-50"
          >
            Thoát
          </button>
          <button
            onClick={() => handleSubmit("save")}
            disabled={submitting}
            className="px-5 py-2 border border-blue-600 text-blue-600 rounded text-sm font-medium hover:bg-blue-50 disabled:opacity-60 flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Tạo phiếu kiểm
          </button>
          <button
            onClick={() => handleSubmit("balance")}
            disabled={submitting}
            className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Cân bằng kho
          </button>
        </div>
      </header>

      {error ? (
        <div className="mx-6 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mx-6 mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}
      {unmatchedSkus.length > 0 ? (
        <div className="mx-6 mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">
                  {unmatchedSkus.length} SKU trong file không khớp sản phẩm nào trong hệ thống — chưa được thêm vào phiếu kiểm:
                </div>
                <div className="mt-1 text-xs text-amber-700">
                  {unmatchedSkus
                    .slice(0, 15)
                    .map((r) => r.sku || "(trống)")
                    .join(", ")}
                  {unmatchedSkus.length > 15 ? ` … và ${unmatchedSkus.length - 15} SKU khác` : ""}
                </div>
              </div>
            </div>
            <button
              onClick={() => setUnmatchedSkus([])}
              className="text-amber-500 hover:text-amber-700 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}
      {pendingCreate.length > 0 ? (
        <div className="mx-6 mt-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-start gap-2">
              <Upload className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="font-medium">
                {pendingCreate.length} SKU chưa có trong hệ thống — sẽ tự tạo sản phẩm mới khi bạn bấm
                &quot;Tạo phiếu kiểm&quot; / &quot;Cân bằng kho&quot; bên dưới:
              </div>
            </div>
            <button
              onClick={() => setPendingCreate([])}
              className="text-blue-500 hover:text-blue-700 flex-shrink-0"
              title="Bỏ qua toàn bộ (không tạo SKU nào trong danh sách này)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
            {pendingCreate.map((row) => (
              <div
                key={row.sku}
                className="flex items-center justify-between gap-2 rounded bg-white/70 px-2 py-1"
              >
                <span className="truncate">
                  <span className="font-mono">{row.sku}</span> — {row.product_name}
                  {row.unit ? ` · ${row.unit}` : ""} · {formatNumber(row.actual_quantity)}
                  {row.cost_price > 0 ? ` · Giá vốn: ${formatNumber(row.cost_price)}` : ""}
                </span>
                <button
                  onClick={() => setPendingCreate((prev) => prev.filter((r) => r.sku !== row.sku))}
                  className="flex-shrink-0 text-blue-400 hover:text-red-600"
                  title="Bỏ SKU này (không tạo sản phẩm mới cho SKU này)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {costPriceFixes.length > 0 ? (
        <div className="mx-6 mt-3 rounded-md border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="font-medium">
                {costPriceFixes.length} SKU lệch giá vốn so với file — sẽ tự cập nhật lại khi bạn bấm
                &quot;Tạo phiếu kiểm&quot; / &quot;Cân bằng kho&quot; bên dưới:
              </div>
            </div>
            <button
              onClick={() => setCostPriceFixes([])}
              className="text-purple-500 hover:text-purple-700 flex-shrink-0"
              title="Bỏ qua toàn bộ (không sửa giá vốn theo file)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
            {costPriceFixes.map((row) => (
              <div
                key={row.product_id}
                className="flex items-center justify-between gap-2 rounded bg-white/70 px-2 py-1"
              >
                <span className="truncate">
                  <span className="font-mono">{row.sku}</span> — {row.product_name} ·{" "}
                  {formatNumber(row.system_cost_price)} → <b>{formatNumber(row.file_cost_price)}</b>
                </span>
                <button
                  onClick={() => setCostPriceFixes((prev) => prev.filter((r) => r.product_id !== row.product_id))}
                  className="flex-shrink-0 text-purple-400 hover:text-red-600"
                  title="Bỏ SKU này (giữ nguyên giá vốn hệ thống)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-12 gap-6 mb-6">
          <div className="col-span-8">
            <section className="bg-white rounded shadow-sm p-5">
              <h2 className="text-base font-semibold mb-6 text-slate-800">Thông tin phiếu</h2>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <label className="text-[13px] font-medium text-slate-600 block mb-1">
                    Chi nhánh kiểm
                  </label>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full border-slate-300 rounded text-sm py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option>Chi nhánh mặc định</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-medium text-slate-600 block mb-1">
                    Nhân viên kiểm
                  </label>
                  <select
                    value={staff}
                    onChange={(e) => setStaff(e.target.value)}
                    className="w-full border-slate-300 rounded text-sm py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Chọn nhân viên --</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.full_name}>{s.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-medium text-slate-600 block mb-1">
                    Mã phiếu
                  </label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={codeLoading ? "Đang tải..." : "Nhập mã phiếu"}
                    className="w-full border-slate-300 rounded text-sm py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="col-span-4 text-sm">
            <section className="bg-white rounded shadow-sm p-5 h-full">
              <h2 className="text-base font-semibold mb-6 text-slate-800">Thông tin bổ sung</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-[13px] font-medium text-slate-600 block mb-1">
                    Ghi chú
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full border-slate-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder="VD: Kiểm hàng ngày 25/07/2022"
                    rows={1}
                  />
                </div>
                <div>
                  <label className="text-[13px] font-medium text-slate-600 block mb-1">
                    Tags
                  </label>
                  <div className="border-slate-300 border rounded p-2 min-h-[60px] space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs"
                        >
                          {tag}
                          <button
                            onClick={() => setTags(tags.filter((t) => t !== tag))}
                            className="hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      className="w-full border-none focus:ring-0 text-sm p-0"
                      placeholder="Nhập ký tự và ấn enter"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <section className="bg-white rounded shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4">
            <div className="flex gap-8 text-[13px] font-medium">
              {(
                [
                  ["all", "Tất cả"],
                  ["pending", `Chưa kiểm (${counts.pending})`],
                  ["matched", `Khớp (${counts.matched})`],
                  ["variance", `Lệch (${counts.variance})`]
                ] as Array<[TabKey, string]>
              ).map(([key, label]) => {
                const active = tab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`py-3.5 px-1 ${
                      active
                        ? "text-blue-600 border-b-2 border-blue-600"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-6 text-[13px] text-slate-500">
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleImportFile(file);
                }}
              />
              <button
                onClick={openImportFile}
                disabled={importing}
                className="flex items-center gap-1.5 hover:text-blue-600 disabled:opacity-60"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Nhập file
              </button>
              <button className="flex items-center gap-1.5 hover:text-blue-600">
                <Package className="w-4 h-4" /> Chú thích phím tắt
              </button>
            </div>
          </div>

          <div className="p-4 flex items-center gap-3">
            <div className="relative flex-1" ref={productBoxRef}>
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                ref={productInputRef}
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Tìm theo tên, mã SKU, hoặc quét mã Barcode...(F3)"
                className="w-full pl-10 pr-32 border-slate-300 rounded text-sm py-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => (multiSelect ? setMultiSelect(false) : openMultiSelect())}
                className={`absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-[12px] border rounded ${
                  multiSelect
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {multiSelect ? `Đang chọn (${multiSelected.size})` : "Chọn nhiều"}
              </button>
              {multiSelect || productResults.length > 0 ? (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded shadow-lg z-20 max-h-72 overflow-y-auto">
                  {multiSelect ? (
                    <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2">
                      <button
                        type="button"
                        onClick={toggleSelectAllResults}
                        disabled={productResults.length === 0}
                        className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-40"
                      >
                        {productResults.length > 0 && productResults.every((r) => multiSelected.has(r.product_id))
                          ? "Bỏ chọn tất cả"
                          : "Chọn tất cả"}
                      </button>
                      <button
                        type="button"
                        onClick={commitMultiSelect}
                        disabled={multiSelected.size === 0}
                        className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-40"
                      >
                        Thêm {multiSelected.size > 0 ? multiSelected.size : ""} sản phẩm
                      </button>
                    </div>
                  ) : null}
                  {productResults.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-slate-500">
                      Không có sản phẩm nào để thêm (đã có trong phiếu hoặc không khớp tìm kiếm).
                    </div>
                  ) : (
                    productResults.map((p) => {
                      const checked = multiSelected.has(p.product_id);
                      return (
                        <button
                          key={p.product_id}
                          type="button"
                          onClick={() =>
                            multiSelect ? toggleMultiSelected(p.product_id) : addProductToCheck(p)
                          }
                          className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between ${
                            checked ? "bg-blue-50" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {multiSelect ? (
                              <input
                                type="checkbox"
                                checked={checked}
                                readOnly
                                className="pointer-events-none"
                              />
                            ) : null}
                            <div>
                              <div className="text-sm font-medium text-slate-800">{p.product_name}</div>
                              <div className="text-xs text-slate-500">
                                SKU: {p.sku || "—"}
                                {p.unit ? ` · ${p.unit}` : ""} · Tồn: {formatNumber(p.system_quantity)}
                              </div>
                            </div>
                          </div>
                          {!multiSelect ? <Plus className="w-4 h-4 text-slate-400" /> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex items-center border border-slate-300 rounded overflow-hidden">
              <button className="bg-slate-50 px-3 py-2 border-r border-slate-300">
                <Filter className="w-4 h-4 text-slate-500" />
              </button>
              <button className="px-3 py-2 flex items-center gap-2 text-sm text-slate-600 hover:bg-slate-50">
                Barcode
              </button>
            </div>
            <button
              onClick={openMultiSelect}
              className="px-5 py-2 border border-blue-600 text-blue-600 rounded text-sm font-medium hover:bg-blue-50"
            >
              Thêm nhanh sản phẩm
            </button>
          </div>

          {/* Header + body trong CÙNG 1 table (trước đây là 2 table riêng — mỗi
              table tự tính độ rộng cột theo nội dung của chính nó, nên header
              và giá trị bị lệch cột khi nội dung 2 bên khác nhau). Dùng 1
              overflow-x-auto + 1 table đảm bảo cột luôn khớp nhau. */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[1000px]">
              <thead className="bg-slate-50 border-y border-slate-200 text-[13px] font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-2.5 w-12 text-center">STT</th>
                  <th className="px-4 py-2.5 w-16">Ảnh</th>
                  <th className="px-4 py-2.5">Tên sản phẩm</th>
                  <th className="px-4 py-2.5 w-24">Đơn vị</th>
                  <th className="px-4 py-2.5 w-32 text-right">Tồn chi nhánh</th>
                  <th className="px-4 py-2.5 w-32 text-right">Tồn thực tế</th>
                  <th className="px-4 py-2.5 w-24 text-right">Lệch</th>
                  <th className="px-4 py-2.5 w-28 text-right">Giá vốn</th>
                  <th className="px-4 py-2.5 w-32 text-right">Giá trị tồn kho</th>
                  <th className="px-4 py-2.5 w-36">Lý do</th>
                  <th className="px-4 py-2.5">Ghi chú</th>
                  <th className="px-4 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stockLoading ? (
                  <tr>
                    <td colSpan={12} className="py-16 text-center text-sm text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" /> Đang tải tồn kho hệ thống…
                      </span>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-20">
                      <div className="flex flex-col items-center justify-center bg-white">
                        <div className="mb-6 opacity-20">
                          <svg
                            fill="none"
                            height="100"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            viewBox="0 0 24 24"
                            width="100"
                          >
                            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                            <path d="m3.3 7 8.7 5 8.7-5" />
                            <path d="M12 22V12" />
                          </svg>
                        </div>
                        <p className="text-slate-500 text-sm mb-4">
                          Phiếu kiểm hàng của bạn chưa có sản phẩm nào
                        </p>
                        <button
                          onClick={openImportFile}
                          disabled={importing}
                          className="px-6 py-2 border border-blue-600 text-blue-600 rounded text-sm font-medium hover:bg-blue-50 disabled:opacity-60 inline-flex items-center gap-2"
                        >
                          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          Nhập file
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : visibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-12 text-slate-500 text-sm">
                        Không có sản phẩm nào trong tab này.
                      </td>
                    </tr>
                  ) : (
                    visibleItems.map((it, idx) => {
                      const variance = it.actual_quantity - it.system_quantity;
                      const varianceClass =
                        Math.abs(variance) < 1e-6
                          ? "text-green-600"
                          : variance > 0
                          ? "text-blue-600"
                          : "text-red-600";
                      return (
                        <tr key={it.rowKey} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 w-12 text-center text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-2.5 w-16">
                            {it.image_url ? (
                              <img
                                src={it.image_url}
                                alt=""
                                className="w-10 h-10 object-cover rounded border"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-slate-300">
                                <Package className="w-5 h-5" />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-slate-800">{it.product_name}</div>
                            <div className="text-xs text-slate-500">
                              {it.sku ? `SKU: ${it.sku}` : "—"}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 w-24 text-slate-600">
                            {it.unit || "—"}
                          </td>
                          <td className="px-4 py-2.5 w-32 text-right tabular-nums text-slate-700">
                            {formatNumber(it.system_quantity)}
                          </td>
                          <td className="px-4 py-2.5 w-32 text-right">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={it.actual_quantity || ""}
                              onChange={(e) =>
                                updateItem(it.rowKey, {
                                  actual_quantity: parseNumberInput(e.target.value)
                                })
                              }
                              className="w-full border-slate-300 rounded text-sm text-right py-1 px-2"
                            />
                          </td>
                          <td
                            className={`px-4 py-2.5 w-24 text-right tabular-nums font-medium ${varianceClass}`}
                          >
                            {formatNumber(variance)}
                          </td>
                          {(() => {
                            const hasMismatch =
                              it.file_cost_price > 0 &&
                              Math.abs(it.file_cost_price - it.system_cost_price) > 0.01;
                            const effectiveCostPrice = it.file_cost_price || it.system_cost_price;
                            return (
                              <>
                                <td
                                  className={`px-4 py-2.5 w-28 text-right tabular-nums ${
                                    hasMismatch ? "font-medium text-purple-600" : "text-slate-700"
                                  }`}
                                  title={
                                    hasMismatch
                                      ? `Giá vốn hệ thống: ${formatNumber(it.system_cost_price)} → file: ${formatNumber(it.file_cost_price)}`
                                      : undefined
                                  }
                                >
                                  {effectiveCostPrice > 0 ? formatNumber(effectiveCostPrice) : "—"}
                                </td>
                                <td className="px-4 py-2.5 w-32 text-right tabular-nums text-slate-600">
                                  {effectiveCostPrice > 0
                                    ? formatNumber(it.actual_quantity * effectiveCostPrice)
                                    : "—"}
                                </td>
                              </>
                            );
                          })()}
                          <td className="px-4 py-2.5 w-36">
                            <select
                              value={it.variance_reason}
                              onChange={(e) =>
                                updateItem(it.rowKey, { variance_reason: e.target.value })
                              }
                              disabled={Math.abs(variance) < 1e-6}
                              className="w-full border-slate-300 rounded text-sm py-1 px-2 disabled:bg-slate-50 disabled:text-slate-400"
                            >
                              <option value="">—</option>
                              {VARIANCE_REASONS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              value={it.note}
                              onChange={(e) => updateItem(it.rowKey, { note: e.target.value })}
                              className="w-full border-slate-300 rounded text-sm py-1 px-2"
                              placeholder="Ghi chú..."
                            />
                          </td>
                          <td className="px-4 py-2.5 w-8 text-right">
                            <button
                              onClick={() => removeItem(it.rowKey)}
                              className="text-slate-400 hover:text-red-600"
                              title="Xóa dòng"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
        </section>
      </div>

      <button className="fixed bottom-6 right-6 w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-600 z-50">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />
        </svg>
      </button>
    </div>
    </PageGuard>
  );
}
