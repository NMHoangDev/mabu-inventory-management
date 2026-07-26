// ⚠️ FILE NÀY PHẢI KHÔNG ĐỤNG DATABASE.
// Cấm import `pg`, `../db/*`, `next/server` hay `./repository` ở đây.
//
// Lý do: `lib/orders/repository.ts` import `../db/migration` + `../db/connection`
// nên KHÔNG component "use client" nào import được → cả app phải chép tay công
// thức tính giá 3 lần (/orders/new, /pos, /orders/[id]/edit). Module khuyến mại
// cố ý tách types + engine + validation ra khỏi repository để không lặp lại lỗi
// đó: mọi type/logic thuần mà UI cần đều nằm ở đây và ở engine.ts.

/** Trùng với DiscountType của lib/orders/repository.ts — cố ý khai báo lại để
 *  file này không phải import module có dính DB. */
export type DiscountType = "amount" | "percent";

export type PromotionType = "discount" | "gift";

export type PromotionMethod =
  | "order_total"
  | "per_product"
  | "by_quantity"
  | "addon_by_order_total";

/** Trạng thái LƯU trong DB (người dùng đặt). */
export type PromotionStatus = "draft" | "active" | "paused" | "ended";

/** Trạng thái HIỂN THỊ — luôn suy ra, không bao giờ lưu. */
export type PromotionDisplayStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "used_up"
  | "ended";

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  discount: "Chiết khấu",
  gift: "Tặng sản phẩm",
};

/** v1: chỉ 'discount' bật. 'gift' vẫn hiện ở modal chọn loại nhưng disabled
 *  ("Sắp có") và bị chặn cả ở repository, không phải chỉ ẩn nút. */
export const PROMOTION_TYPE_ENABLED: Record<PromotionType, boolean> = {
  discount: true,
  gift: false,
};

export const PROMOTION_METHOD_LABELS: Record<PromotionMethod, string> = {
  order_total: "Chiết khấu theo tổng giá trị đơn hàng",
  per_product: "Chiết khấu theo từng sản phẩm",
  by_quantity: "Chiết khấu theo số lượng sản phẩm",
  addon_by_order_total: "Chiết khấu sản phẩm mua thêm theo tổng giá trị đơn hàng",
};

export const PROMOTION_METHOD_HINTS: Record<PromotionMethod, string> = {
  order_total:
    "Đơn hàng đạt tổng tiền theo từng bậc sẽ được giảm giá tương ứng trên tổng đơn.",
  per_product:
    "Mua bất kỳ sản phẩm trong danh sách với số lượng tối thiểu sẽ được chiết khấu trên từng sản phẩm.",
  by_quantity:
    "Mỗi sản phẩm có các bậc số lượng riêng — mua từ bao nhiêu đến bao nhiêu thì hưởng mức chiết khấu tương ứng.",
  addon_by_order_total:
    "Đơn hàng đạt tổng tiền tối thiểu thì các sản phẩm mua thêm trong danh sách được chiết khấu.",
};

export const PROMOTION_STATUS_LABELS: Record<PromotionDisplayStatus, string> = {
  draft: "Nháp",
  scheduled: "Chưa diễn ra",
  running: "Đang chạy",
  paused: "Tạm dừng",
  used_up: "Hết lượt áp dụng",
  ended: "Đã kết thúc",
};

export const PROMOTION_STATUS_CLASSES: Record<PromotionDisplayStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  running: "bg-green-100 text-green-700",
  paused: "bg-orange-100 text-orange-700",
  used_up: "bg-orange-100 text-orange-700",
  ended: "bg-gray-100 text-gray-500",
};

/** Trạng thái người dùng được phép tự đặt ở form (used_up/scheduled là suy ra). */
export const PROMOTION_EDITABLE_STATUSES: PromotionStatus[] = ["draft", "active", "paused", "ended"];

export const PROMOTION_EDITABLE_STATUS_LABELS: Record<PromotionStatus, string> = {
  draft: "Nháp",
  active: "Đang áp dụng",
  paused: "Tạm dừng",
  ended: "Kết thúc",
};

// ─── Rule shapes ────────────────────────────────────────────────────────────

export interface PromotionProductRef {
  product_id: string;
  product_name: string;
  product_sku: string;
  unit?: string;
  image_url?: string;
}

/** 1. order_total — bậc thang theo tổng tiền đơn. */
export interface OrderTotalTier {
  row_id: string;
  min_order_total: number;
  discount_type: DiscountType;
  discount_value: number;
}
export interface OrderTotalRules {
  kind: "order_total";
  tiers: OrderTotalTier[];
}

/** 2. per_product — mua bất kỳ SP trong danh sách với SL tối thiểu N. */
export interface PerProductRules {
  kind: "per_product";
  products: PromotionProductRef[];
  /** SL tối thiểu tính THEO TỪNG DÒNG, không gộp cả giỏ. */
  min_quantity: number;
  /** PER UNIT: amount = đồng/sp, percent = % đơn giá. */
  discount_type: DiscountType;
  discount_value: number;
  /** "Giới hạn KM": tổng SL sản phẩm được hưởng CK trên toàn đơn. null = không giới hạn. */
  quantity_cap: number | null;
}

/** 3. by_quantity — bảng phẳng: Sản phẩm mua | SL từ | SL đến | Chiết khấu.
 *  MỘT sản phẩm được phép có NHIỀU dòng (dữ liệu Sapo thật có 10→19, 20→∞, 20→49
 *  cùng 1 sản phẩm). qty_to = null nghĩa là không giới hạn trên. */
export interface QuantityTierRow {
  row_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  image_url?: string;
  qty_from: number;
  qty_to: number | null;
  /** PER UNIT — xem ghi chú số học ở đầu engine.ts. */
  discount_type: DiscountType;
  discount_value: number;
}
export interface ByQuantityRules {
  kind: "by_quantity";
  rows: QuantityTierRow[];
}

/** 4. addon_by_order_total — đơn đạt ngưỡng thì SP "mua thêm" được CK. */
export interface AddonByOrderTotalRules {
  kind: "addon_by_order_total";
  min_order_total: number;
  addon_products: PromotionProductRef[];
  discount_type: DiscountType;
  discount_value: number;
  quantity_cap: number | null;
  /** true (mặc định): tiền của chính SP mua thêm KHÔNG tính vào ngưỡng, để khách
   *  không thể dùng chính hàng khuyến mại tự đẩy đơn đạt ngưỡng. */
  threshold_excludes_addons: boolean;
}

/** v1 chưa có engine cho gift — vẫn model để sau này không phải breaking change. */
export interface GiftRules {
  kind: "gift";
  min_order_total?: number;
  trigger_products?: PromotionProductRef[];
  gift_products?: Array<PromotionProductRef & { quantity: number }>;
}

export type PromotionRules =
  | OrderTotalRules
  | PerProductRules
  | ByQuantityRules
  | AddonByOrderTotalRules
  | GiftRules;

/** rules.kind phải luôn khớp method — dùng để validate cả 2 phía. */
export function rulesKindForMethod(method: PromotionMethod): PromotionRules["kind"] {
  return method;
}

/**
 * Form giữ 1 bucket rules RIÊNG cho mỗi phương thức (không phải 1 rules dùng
 * chung) — đổi qua đổi lại "Chọn phương thức khuyến mại" không làm mất dữ liệu
 * đã nhập ở phương thức khác. Khi submit chỉ gửi bucket đang chọn.
 */
export interface PromotionRulesByMethod {
  order_total: OrderTotalRules;
  per_product: PerProductRules;
  by_quantity: ByQuantityRules;
  addon_by_order_total: AddonByOrderTotalRules;
}

export function emptyRulesByMethod(): PromotionRulesByMethod {
  return {
    order_total: { kind: "order_total", tiers: [] },
    per_product: { kind: "per_product", products: [], min_quantity: 1, discount_type: "amount", discount_value: 0, quantity_cap: null },
    by_quantity: { kind: "by_quantity", rows: [] },
    addon_by_order_total: {
      kind: "addon_by_order_total",
      min_order_total: 0,
      addon_products: [],
      discount_type: "amount",
      discount_value: 0,
      quantity_cap: null,
      threshold_excludes_addons: true,
    },
  };
}

// ─── Entity ─────────────────────────────────────────────────────────────────

export interface Promotion {
  id: string;
  code: string;
  name: string;
  description: string;
  promo_type: PromotionType;
  method: PromotionMethod;
  status: PromotionStatus;
  rules: PromotionRules;
  /** null = "Không giới hạn số lượng" */
  usage_limit: number | null;
  usage_count: number;
  starts_at: string;
  /** null = "không giới hạn" */
  ends_at: string | null;
  priority: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PromotionListRow extends Omit<Promotion, "rules"> {
  display_status: PromotionDisplayStatus;
  /** usage_limit === null ? null : usage_limit - usage_count ("Số phiếu còn lại") */
  remaining: number | null;
  rule_summary: string;
}

export function derivePromotionStatus(
  p: Pick<Promotion, "status" | "starts_at" | "ends_at" | "usage_limit" | "usage_count">,
  now: Date = new Date()
): PromotionDisplayStatus {
  if (p.status === "draft") return "draft";
  if (p.status === "ended") return "ended";
  if (p.ends_at && new Date(p.ends_at).getTime() < now.getTime()) return "ended";
  if (p.status === "paused") return "paused";
  if (p.usage_limit !== null && p.usage_count >= p.usage_limit) return "used_up";
  if (new Date(p.starts_at).getTime() > now.getTime()) return "scheduled";
  return "running";
}

// ─── Engine I/O ─────────────────────────────────────────────────────────────

export interface EngineCartItem {
  /** Định danh DÒNG, không phải sản phẩm — 1 sản phẩm có thể nằm ở 2 dòng khác nhau. */
  line_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  /** Chiết khấu người dùng tự nhập sẵn trên dòng. Engine chỉ ĐỌC để tính base
   *  và báo xung đột — không bao giờ tự ghi đè. */
  discount_type?: DiscountType;
  discount_value?: number;
}

export interface EngineCart {
  items: EngineCartItem[];
  order_discount_type?: DiscountType;
  order_discount_value?: number;
}

export interface PromotionLineEffect {
  line_id: string;
  product_id: string | null;
  product_name: string;
  /** SL thực sự được hưởng (sau khi trừ quantity_cap). */
  quantity_applied: number;
  /** LUÔN 'amount' — xem ghi chú ở engine.ts. */
  discount_type: "amount";
  /** TỔNG tiền chiết khấu của cả dòng = per_unit × quantity_applied. */
  discount_value: number;
  /** Tiền chiết khấu trên 1 đơn vị (để hiện ô kiểu "1.000 (7,04%)"). */
  per_unit: number;
  percent_equivalent: number;
  matched_rule_label: string;
  /** true nếu dòng này đã có chiết khấu tay khác 0 → caller phải cảnh báo. */
  conflicts_with_manual: boolean;
}

export interface PromotionOrderEffect {
  discount_type: DiscountType;
  discount_value: number;
  /** Quy đổi ra tiền để so sánh/hiển thị. */
  discount_amount: number;
  matched_rule_label: string;
}

export interface PromotionCandidate {
  promotion_id: string;
  code: string;
  name: string;
  description: string;
  promo_type: PromotionType;
  method: PromotionMethod;
  line_effects: PromotionLineEffect[];
  order_discount?: PromotionOrderEffect;
  /** Tổng tiền khách được giảm nếu áp CTKM này — dùng để xếp hạng gợi ý. */
  total_discount: number;
  reason: string;
  /** Các dòng điều kiện để hiện ở link "Xem điều kiện". */
  condition_lines: string[];
  has_conflict: boolean;
  /** false khi trả về ở chế độ includeIneligible (gợi ý mua thêm). */
  eligible: boolean;
}

/** Ghi nhận CTKM đã áp lên 1 đơn — gửi kèm khi POST /api/orders. */
export interface AppliedPromotionInput {
  promotion_id: string;
  code: string;
  name: string;
  method: string;
  discount_amount: number;
  snapshot?: Record<string, unknown>;
}

// ─── Form (client-only state shape) ────────────────────────────────────────

export interface PromotionFormValues {
  name: string;
  code: string;
  description: string;
  quantity_limit: number | null;
  unlimited_quantity: boolean;
  /** datetime-local string, "" = chưa đặt (mặc định now() ở server). */
  starts_at: string;
  /** "" = không giới hạn. */
  ends_at: string;
  status: PromotionStatus;
  method: PromotionMethod;
  rules: PromotionRulesByMethod;
}

export function emptyPromotionForm(method: PromotionMethod = "by_quantity"): PromotionFormValues {
  return {
    name: "",
    code: "",
    description: "",
    quantity_limit: null,
    unlimited_quantity: true,
    starts_at: "",
    ends_at: "",
    status: "active",
    method,
    rules: emptyRulesByMethod(),
  };
}

/** Validate thuần phía client — server (validation.ts) validate lại lần nữa,
 *  không tin form. Trả về map lỗi theo field key để hiện inline. */
export function validatePromotionForm(values: PromotionFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.name.trim()) errors.name = "Tên khuyến mại không được để trống";
  if (!values.unlimited_quantity && (values.quantity_limit === null || values.quantity_limit < 1)) {
    errors.quantity_limit = "Số lượng áp dụng phải lớn hơn 0";
  }
  if (values.starts_at && values.ends_at && new Date(values.ends_at).getTime() < new Date(values.starts_at).getTime()) {
    errors.ends_at = "Ngày kết thúc phải sau ngày bắt đầu";
  }

  const rules = values.rules[values.method];
  switch (rules.kind) {
    case "order_total": {
      if (rules.tiers.length === 0) errors["tiers"] = "Cần ít nhất 1 bậc chiết khấu.";
      rules.tiers.forEach((t, i) => {
        if (t.discount_value <= 0) errors[`rules.${i}.discount_value`] = "Chiết khấu phải > 0";
        if (t.discount_type === "percent" && t.discount_value > 100) errors[`rules.${i}.discount_value`] = "Tối đa 100%";
      });
      break;
    }
    case "per_product": {
      if (rules.products.length === 0) errors["products"] = "Cần chọn ít nhất 1 sản phẩm.";
      if (rules.min_quantity < 1) errors["min_quantity"] = "SL tối thiểu phải ≥ 1";
      if (rules.discount_value <= 0) errors["discount_value"] = "Chiết khấu phải > 0";
      if (rules.discount_type === "percent" && rules.discount_value > 100) errors["discount_value"] = "Tối đa 100%";
      break;
    }
    case "by_quantity": {
      if (rules.rows.length === 0) errors["rules"] = "Cần ít nhất 1 dòng điều kiện.";
      rules.rows.forEach((r, i) => {
        if (!r.product_id) errors[`rules.${i}.product_id`] = "Chọn sản phẩm";
        if (r.qty_from < 1) errors[`rules.${i}.qty_from`] = "SL từ phải ≥ 1";
        if (r.qty_to !== null && r.qty_to < r.qty_from) errors[`rules.${i}.qty_to`] = "SL đến phải ≥ SL từ";
        if (r.discount_value <= 0) errors[`rules.${i}.discount_value`] = "Chiết khấu phải > 0";
        if (r.discount_type === "percent" && r.discount_value > 100) errors[`rules.${i}.discount_value`] = "Tối đa 100%";
      });
      break;
    }
    case "addon_by_order_total": {
      if (rules.addon_products.length === 0) errors["addon_products"] = "Cần chọn ít nhất 1 sản phẩm mua thêm.";
      if (rules.min_order_total < 0) errors["min_order_total"] = "Không được âm";
      if (rules.discount_value <= 0) errors["discount_value"] = "Chiết khấu phải > 0";
      if (rules.discount_type === "percent" && rules.discount_value > 100) errors["discount_value"] = "Tối đa 100%";
      break;
    }
  }
  return errors;
}
