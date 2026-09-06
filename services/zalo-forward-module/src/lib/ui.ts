/**
 * Class dùng chung cho toàn module — port công thức từ src/lib/styles.ts của
 * webapp merkeeai (xem COLOR_SYSTEM_GUIDE.md của app đó), qua zalo-account-module.
 *
 * Vì sao gom vào 1 file: cùng 1 kiểu nút/input/thẻ/pill xuất hiện ở nhiều
 * trang, viết tay mỗi nơi thì sớm muộn cũng lệch nhau. App gốc cũng làm y vậy.
 *
 * KHÔNG copy token kiểu `bg-surface-app-primary` của app gốc — những token đó
 * chỉ tồn tại nhờ CSS vars + `@theme inline` của Tailwind v4; module này là
 * v3.4 nên dùng class thật (slate + `brand` khai báo trong tailwind.config.js).
 */

/** Viền + ring khi focus bằng bàn phím — quy ước dùng ở mọi control. */
const FOCUS = "outline-none focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/40";

const BTN_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 " +
  FOCUS;

export const btn = {
  /** Hành động chính — tô đặc màu thương hiệu. */
  primary: `${BTN_BASE} bg-brand text-white shadow-sm hover:bg-brand-hover`,
  /** Hành động phụ — viền, nền trắng. */
  outline: `${BTN_BASE} border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50`,
  /** Không viền — dùng trong toolbar/hàng bảng cho đỡ nặng. */
  ghost: `${BTN_BASE} text-slate-600 hover:bg-slate-100 hover:text-slate-900`,
  /** Hành động phá hủy (xoá). */
  danger: `${BTN_BASE} border border-red-200 bg-white text-red-600 shadow-sm hover:bg-red-50`,
  /** Cảnh báo — dùng cho "Đăng nhập lại" khi tài khoản mất kết nối. */
  warning: `${BTN_BASE} border border-amber-300 bg-amber-50 text-amber-700 shadow-sm hover:bg-amber-100`
};

export const btnSize = {
  sm: "h-8 px-3",
  md: "h-9 px-4",
  lg: "h-10 px-6 text-base",
  icon: "h-8 w-8 p-0"
};

export const input =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm transition-[color,box-shadow] placeholder:text-slate-400 disabled:opacity-50 " +
  FOCUS;

/** Input có icon nằm bên trái (thêm padding-left cho icon). */
export const inputWithIcon = `${input} pl-9`;

export const select =
  "h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-700 shadow-sm " + FOCUS;

/** Thẻ/panel — phân định bằng viền, shadow rất nhẹ. */
export const card = "rounded-xl border border-slate-200 bg-white shadow-sm";

export const label = "mb-1.5 block text-xs font-medium text-slate-600";

/** Pill trạng thái — idiom `ring-1 ring-inset` của app gốc. */
const PILL_BASE =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

export const pill = {
  success: `${PILL_BASE} bg-emerald-50 text-emerald-700 ring-emerald-600/20`,
  warning: `${PILL_BASE} bg-amber-50 text-amber-700 ring-amber-600/20`,
  danger: `${PILL_BASE} bg-red-50 text-red-700 ring-red-600/20`,
  info: `${PILL_BASE} bg-blue-50 text-blue-700 ring-blue-600/20`,
  neutral: `${PILL_BASE} bg-slate-100 text-slate-600 ring-slate-500/20`
};

export const table = {
  wrapper: "relative w-full overflow-x-auto",
  root: "w-full caption-bottom text-sm",
  head: "h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-slate-500",
  row: "border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70",
  cell: "px-4 py-3 align-middle"
};

export const modal = {
  overlay: "fixed inset-0 z-50 bg-black/50 p-4",
  panel: "w-full rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
};

/** Nhịp dọc giữa các khối trong 1 trang — app gốc dùng space-y-6 ở khắp nơi. */
export const pageStack = "space-y-6";

export const alert = {
  error: "flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700",
  success: "flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700",
  info: "flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700"
};
