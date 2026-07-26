// ⚠️ FILE NÀY PHẢI KHÔNG ĐỤNG DATABASE (xem ghi chú đầu ./types.ts).
// Engine thuần, không I/O → dùng được cả ở server (route /api/promotions/apply)
// lẫn ở client. Đây chính là chỗ POS sau này cắm vào mà KHÔNG phải sửa gì.
//
// ── Ghi chú số học quan trọng (đã kiểm chứng từ ảnh Sapo thật) ──────────────
// Ảnh POS mẫu: SL 50 × đơn giá 14.200 = 710.000; cột "Chiết khấu" hiện
// "1.000 (7,04%)"; thành tiền 660.000.
//   710.000 − 660.000 = 50.000 = 1.000 × 50   → giá trị cấu hình là PER UNIT
//   50.000 / 710.000  = 7,04%                 → % hiển thị là % của cả dòng
//
// Nhưng `order_items.discount_value` khi `discount_type='amount'` lại là TỔNG
// của cả dòng (xem lineItemDiscountAmount trong lib/orders/repository.ts:80-84).
// Vì vậy engine tự nhân per_unit × quantity rồi phát ra 'amount'.
//
// Vì sao LUÔN normalize về 'amount' thay vì giữ 'percent': nếu phát ra percent,
// ý nghĩa sẽ ÂM THẦM ĐỔI khi thu ngân sửa số lượng sau đó (percent bám theo
// base mới), trong khi CTKM đã được chốt tại thời điểm áp. per_unit và
// percent_equivalent vẫn được trả kèm để UI hiển thị mà không phải tính lại.

import {
  derivePromotionStatus,
  type AddonByOrderTotalRules,
  type ByQuantityRules,
  type DiscountType,
  type EngineCart,
  type EngineCartItem,
  type OrderTotalRules,
  type PerProductRules,
  type Promotion,
  type PromotionCandidate,
  type PromotionLineEffect,
  type QuantityTierRow,
} from "./types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n);
}

function fmtDiscount(type: DiscountType, value: number): string {
  return type === "percent" ? `${value}%` : `${fmtMoney(value)}đ`;
}

// ─── Helpers dùng chung (POS tái dùng được) ─────────────────────────────────

export function lineBase(item: EngineCartItem): number {
  return item.quantity * item.unit_price;
}

/** Cùng công thức với lineItemDiscountAmount ở lib/orders/repository.ts. */
export function manualLineDiscount(item: EngineCartItem): number {
  const base = lineBase(item);
  const type = item.discount_type ?? "amount";
  const value = item.discount_value ?? 0;
  const raw = type === "percent" ? (base * value) / 100 : value;
  return clamp(raw, 0, base);
}

export function cartSubtotal(cart: EngineCart): number {
  return cart.items.reduce((s, i) => s + lineBase(i), 0);
}

export function cartManualLineDiscountTotal(cart: EngineCart): number {
  return cart.items.reduce((s, i) => s + manualLineDiscount(i), 0);
}

/** Base mà chiết khấu tổng đơn áp lên — khớp createOrder() (repository.ts:410-417). */
export function cartDiscountBase(cart: EngineCart): number {
  return Math.max(0, cartSubtotal(cart) - cartManualLineDiscountTotal(cart));
}

export function perUnitDiscount(unitPrice: number, type: DiscountType, value: number): number {
  const raw = type === "percent" ? (unitPrice * value) / 100 : value;
  return clamp(raw, 0, unitPrice);
}

function makeLineEffect(
  item: EngineCartItem,
  perUnit: number,
  quantityApplied: number,
  label: string
): PromotionLineEffect | null {
  if (perUnit <= 0 || quantityApplied <= 0) return null;
  const base = lineBase(item);
  const discountValue = round2(Math.min(perUnit * quantityApplied, base));
  if (discountValue <= 0) return null;
  return {
    line_id: item.line_id,
    product_id: item.product_id,
    product_name: item.product_name,
    quantity_applied: quantityApplied,
    discount_type: "amount",
    discount_value: discountValue,
    per_unit: round2(perUnit),
    percent_equivalent: base > 0 ? round2((discountValue / base) * 100) : 0,
    matched_rule_label: label,
    conflicts_with_manual: (item.discount_value ?? 0) > 0,
  };
}

/**
 * Chọn bậc tốt nhất cho 1 dòng trong phương thức by_quantity.
 *
 * Dữ liệu Sapo THẬT có khoảng chồng nhau (ảnh mẫu: cùng 1 sản phẩm có row
 * 10→19, 20→∞ và 20→49) nên KHÔNG được chặn lúc cấu hình. Tie-break xác định,
 * không phụ thuộc thứ tự mảng:
 *   1. per_unit lớn nhất  → lợi nhất cho khách
 *   2. qty_from lớn hơn   → bậc cụ thể hơn thắng
 *   3. có chặn trên trước → (qty_to !== null) thắng (∞)
 *   4. khoảng hẹp hơn
 *   5. thứ tự cấu hình
 */
export function pickBestQuantityTier(
  rows: QuantityTierRow[],
  productId: string,
  quantity: number,
  unitPrice: number
): QuantityTierRow | null {
  const matching = rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        row.product_id === productId &&
        quantity >= row.qty_from &&
        (row.qty_to === null || quantity <= row.qty_to)
    );
  if (matching.length === 0) return null;

  const span = (r: QuantityTierRow) => (r.qty_to === null ? Number.POSITIVE_INFINITY : r.qty_to - r.qty_from);

  matching.sort((a, b) => {
    const pa = perUnitDiscount(unitPrice, a.row.discount_type, a.row.discount_value);
    const pb = perUnitDiscount(unitPrice, b.row.discount_type, b.row.discount_value);
    if (pa !== pb) return pb - pa;
    if (a.row.qty_from !== b.row.qty_from) return b.row.qty_from - a.row.qty_from;
    const aBounded = a.row.qty_to !== null ? 0 : 1;
    const bBounded = b.row.qty_to !== null ? 0 : 1;
    if (aBounded !== bBounded) return aBounded - bBounded;
    const sa = span(a.row);
    const sb = span(b.row);
    if (sa !== sb) return sa - sb;
    return a.index - b.index;
  });

  return matching[0].row;
}

/**
 * Phân bổ "Giới hạn KM" (quantity_cap): ưu tiên dòng có per_unit cao nhất để
 * khách được lợi nhất. Tie-break: đơn giá cao hơn, rồi thứ tự trong giỏ.
 */
function allocateWithCap(
  entries: Array<{ item: EngineCartItem; perUnit: number; index: number }>,
  cap: number | null
): Array<{ item: EngineCartItem; perUnit: number; quantityApplied: number }> {
  if (cap === null) {
    return entries.map((e) => ({ item: e.item, perUnit: e.perUnit, quantityApplied: e.item.quantity }));
  }
  const sorted = [...entries].sort((a, b) => {
    if (a.perUnit !== b.perUnit) return b.perUnit - a.perUnit;
    if (a.item.unit_price !== b.item.unit_price) return b.item.unit_price - a.item.unit_price;
    return a.index - b.index;
  });
  let remaining = cap;
  const out: Array<{ item: EngineCartItem; perUnit: number; quantityApplied: number }> = [];
  for (const entry of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, entry.item.quantity);
    remaining -= take;
    out.push({ item: entry.item, perUnit: entry.perUnit, quantityApplied: take });
  }
  return out;
}

// ─── Từng phương thức ───────────────────────────────────────────────────────

function evalOrderTotal(promo: Promotion, cart: EngineCart): PromotionCandidate | null {
  const rules = promo.rules as OrderTotalRules;
  if (!Array.isArray(rules.tiers) || rules.tiers.length === 0) return null;

  const base = cartDiscountBase(cart);
  const eligible = rules.tiers.filter((t) => base >= t.min_order_total);
  const conditionLines = [...rules.tiers]
    .sort((a, b) => a.min_order_total - b.min_order_total)
    .map((t) => `Đơn từ ${fmtMoney(t.min_order_total)}đ: giảm ${fmtDiscount(t.discount_type, t.discount_value)}`);

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    if (a.min_order_total !== b.min_order_total) return b.min_order_total - a.min_order_total;
    const ma = clamp(a.discount_type === "percent" ? (base * a.discount_value) / 100 : a.discount_value, 0, base);
    const mb = clamp(b.discount_type === "percent" ? (base * b.discount_value) / 100 : b.discount_value, 0, base);
    return mb - ma;
  });
  const tier = eligible[0];
  const amount = round2(
    clamp(tier.discount_type === "percent" ? (base * tier.discount_value) / 100 : tier.discount_value, 0, base)
  );
  if (amount <= 0) return null;

  const label = `Đơn từ ${fmtMoney(tier.min_order_total)}đ: giảm ${fmtDiscount(tier.discount_type, tier.discount_value)}`;
  return {
    promotion_id: promo.id,
    code: promo.code,
    name: promo.name,
    description: promo.description,
    promo_type: promo.promo_type,
    method: promo.method,
    line_effects: [],
    order_discount: {
      discount_type: tier.discount_type,
      discount_value: tier.discount_value,
      discount_amount: amount,
      matched_rule_label: label,
    },
    total_discount: amount,
    reason: `${label} — giảm ${fmtMoney(amount)}đ`,
    condition_lines: conditionLines,
    has_conflict: false,
    eligible: true,
  };
}

function evalPerProduct(promo: Promotion, cart: EngineCart): PromotionCandidate | null {
  const rules = promo.rules as PerProductRules;
  if (!Array.isArray(rules.products) || rules.products.length === 0) return null;
  const ids = new Set(rules.products.map((p) => p.product_id));

  const entries = cart.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.product_id && ids.has(item.product_id) && item.quantity >= rules.min_quantity)
    .map(({ item, index }) => ({
      item,
      index,
      perUnit: perUnitDiscount(item.unit_price, rules.discount_type, rules.discount_value),
    }));

  const conditionLines = [
    `Mua tối thiểu ${rules.min_quantity} sản phẩm/mặt hàng trong danh sách`,
    `Chiết khấu ${fmtDiscount(rules.discount_type, rules.discount_value)} trên mỗi sản phẩm`,
    rules.quantity_cap !== null
      ? `Giới hạn tối đa ${rules.quantity_cap} sản phẩm được hưởng khuyến mại`
      : "Không giới hạn số lượng sản phẩm được hưởng",
    `Áp dụng cho ${rules.products.length} sản phẩm: ${rules.products.map((p) => p.product_name).join(", ")}`,
  ];

  if (entries.length === 0) return null;

  const allocated = allocateWithCap(entries, rules.quantity_cap);
  const label = `Mua từ ${rules.min_quantity} sp: giảm ${fmtDiscount(rules.discount_type, rules.discount_value)}/sp`;
  const lineEffects = allocated
    .map((a) => makeLineEffect(a.item, a.perUnit, a.quantityApplied, label))
    .filter((e): e is PromotionLineEffect => e !== null);
  if (lineEffects.length === 0) return null;

  const total = round2(lineEffects.reduce((s, e) => s + e.discount_value, 0));
  return {
    promotion_id: promo.id,
    code: promo.code,
    name: promo.name,
    description: promo.description,
    promo_type: promo.promo_type,
    method: promo.method,
    line_effects: lineEffects,
    total_discount: total,
    reason: `Áp dụng cho ${lineEffects.length} dòng sản phẩm, giảm ${fmtMoney(total)}đ`,
    condition_lines: conditionLines,
    has_conflict: lineEffects.some((e) => e.conflicts_with_manual),
    eligible: true,
  };
}

function evalByQuantity(promo: Promotion, cart: EngineCart): PromotionCandidate | null {
  const rules = promo.rules as ByQuantityRules;
  if (!Array.isArray(rules.rows) || rules.rows.length === 0) return null;

  const byProduct = new Map<string, QuantityTierRow[]>();
  for (const row of rules.rows) {
    const arr = byProduct.get(row.product_id) ?? [];
    arr.push(row);
    byProduct.set(row.product_id, arr);
  }
  const conditionLines = Array.from(byProduct.entries()).map(([, rows]) => {
    const name = rows[0].product_name || "Sản phẩm";
    const parts = [...rows]
      .sort((a, b) => a.qty_from - b.qty_from)
      .map(
        (r) =>
          `${r.qty_from}${r.qty_to === null ? "+" : `–${r.qty_to}`}: ${fmtDiscount(r.discount_type, r.discount_value)}/sp`
      );
    return `${name} — ${parts.join(" | ")}`;
  });

  const lineEffects: PromotionLineEffect[] = [];
  for (const item of cart.items) {
    if (!item.product_id) continue;
    const tier = pickBestQuantityTier(rules.rows, item.product_id, item.quantity, item.unit_price);
    if (!tier) continue;
    const perUnit = perUnitDiscount(item.unit_price, tier.discount_type, tier.discount_value);
    const label = `Mua ${tier.qty_from}${tier.qty_to === null ? "+" : ` → ${tier.qty_to}`}: giảm ${fmtDiscount(tier.discount_type, tier.discount_value)}/sp`;
    const effect = makeLineEffect(item, perUnit, item.quantity, label);
    if (effect) lineEffects.push(effect);
  }
  if (lineEffects.length === 0) return null;

  const total = round2(lineEffects.reduce((s, e) => s + e.discount_value, 0));
  return {
    promotion_id: promo.id,
    code: promo.code,
    name: promo.name,
    description: promo.description,
    promo_type: promo.promo_type,
    method: promo.method,
    line_effects: lineEffects,
    total_discount: total,
    reason: `Áp dụng cho ${lineEffects.length} dòng sản phẩm, giảm ${fmtMoney(total)}đ`,
    condition_lines: conditionLines,
    has_conflict: lineEffects.some((e) => e.conflicts_with_manual),
    eligible: true,
  };
}

function evalAddonByOrderTotal(
  promo: Promotion,
  cart: EngineCart,
  includeIneligible: boolean
): PromotionCandidate | null {
  const rules = promo.rules as AddonByOrderTotalRules;
  if (!Array.isArray(rules.addon_products) || rules.addon_products.length === 0) return null;
  const addonIds = new Set(rules.addon_products.map((p) => p.product_id));

  // Mặc định KHÔNG tính tiền của chính SP mua thêm vào ngưỡng — nếu tính, khách
  // có thể dùng chính hàng khuyến mại để tự đẩy đơn đạt ngưỡng.
  const thresholdBase = rules.threshold_excludes_addons
    ? cart.items
        .filter((i) => !(i.product_id && addonIds.has(i.product_id)))
        .reduce((s, i) => s + Math.max(0, lineBase(i) - manualLineDiscount(i)), 0)
    : cartDiscountBase(cart);

  const conditionLines = [
    `Đơn hàng đạt tối thiểu ${fmtMoney(rules.min_order_total)}đ`,
    rules.threshold_excludes_addons
      ? "(Không tính tiền của chính các sản phẩm mua thêm vào ngưỡng)"
      : "(Tính cả tiền sản phẩm mua thêm vào ngưỡng)",
    `Sản phẩm mua thêm được giảm ${fmtDiscount(rules.discount_type, rules.discount_value)} trên mỗi sản phẩm`,
    rules.quantity_cap !== null
      ? `Giới hạn tối đa ${rules.quantity_cap} sản phẩm được hưởng`
      : "Không giới hạn số lượng được hưởng",
    `Sản phẩm mua thêm: ${rules.addon_products.map((p) => p.product_name).join(", ")}`,
  ];

  if (thresholdBase < rules.min_order_total) {
    if (!includeIneligible) return null;
    return {
      promotion_id: promo.id,
      code: promo.code,
      name: promo.name,
      description: promo.description,
      promo_type: promo.promo_type,
      method: promo.method,
      line_effects: [],
      total_discount: 0,
      reason: `Cần mua thêm ${fmtMoney(rules.min_order_total - thresholdBase)}đ để đạt điều kiện`,
      condition_lines: conditionLines,
      has_conflict: false,
      eligible: false,
    };
  }

  const entries = cart.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.product_id && addonIds.has(item.product_id))
    .map(({ item, index }) => ({
      item,
      index,
      perUnit: perUnitDiscount(item.unit_price, rules.discount_type, rules.discount_value),
    }));
  if (entries.length === 0) return null;

  const allocated = allocateWithCap(entries, rules.quantity_cap);
  const label = `Đơn từ ${fmtMoney(rules.min_order_total)}đ: SP mua thêm giảm ${fmtDiscount(rules.discount_type, rules.discount_value)}/sp`;
  const lineEffects = allocated
    .map((a) => makeLineEffect(a.item, a.perUnit, a.quantityApplied, label))
    .filter((e): e is PromotionLineEffect => e !== null);
  if (lineEffects.length === 0) return null;

  const total = round2(lineEffects.reduce((s, e) => s + e.discount_value, 0));
  return {
    promotion_id: promo.id,
    code: promo.code,
    name: promo.name,
    description: promo.description,
    promo_type: promo.promo_type,
    method: promo.method,
    line_effects: lineEffects,
    total_discount: total,
    reason: `Áp dụng cho ${lineEffects.length} sản phẩm mua thêm, giảm ${fmtMoney(total)}đ`,
    condition_lines: conditionLines,
    has_conflict: lineEffects.some((e) => e.conflicts_with_manual),
    eligible: true,
  };
}

// ─── Entry point ────────────────────────────────────────────────────────────

export function evaluatePromotions(
  promotions: Promotion[],
  cart: EngineCart,
  options?: { now?: Date; includeIneligible?: boolean }
): PromotionCandidate[] {
  const now = options?.now ?? new Date();
  const includeIneligible = options?.includeIneligible ?? false;

  const items = cart.items.filter((i) => i.quantity > 0 && i.unit_price >= 0);
  if (items.length === 0) return [];
  const safeCart: EngineCart = { ...cart, items };

  const out: PromotionCandidate[] = [];
  for (const promo of promotions) {
    if (promo.promo_type !== "discount") continue; // v1: chưa có engine cho 'gift'
    if (derivePromotionStatus(promo, now) !== "running") continue;
    if (!promo.rules || (promo.rules as { kind?: string }).kind !== promo.method) continue;

    let candidate: PromotionCandidate | null = null;
    switch (promo.method) {
      case "order_total":
        candidate = evalOrderTotal(promo, safeCart);
        break;
      case "per_product":
        candidate = evalPerProduct(promo, safeCart);
        break;
      case "by_quantity":
        candidate = evalByQuantity(promo, safeCart);
        break;
      case "addon_by_order_total":
        candidate = evalAddonByOrderTotal(promo, safeCart, includeIneligible);
        break;
    }
    if (candidate) out.push(candidate);
  }

  out.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.total_discount !== b.total_discount) return b.total_discount - a.total_discount;
    return a.code.localeCompare(b.code);
  });
  return out;
}

/**
 * Gộp hiệu lực của nhiều CTKM được chọn cùng lúc.
 * Ràng buộc: order_items chỉ có ĐÚNG 1 cặp (discount_type, discount_value)/dòng
 * → 1 dòng chỉ chịu được 1 CTKM. Xung đột lấy mức giảm cao hơn. Chiết khấu cấp
 * đơn cũng chỉ có 1 ô (orders.discount) → chỉ giữ 1 CTKM cấp đơn tốt nhất.
 */
export function mergeCandidates(candidates: PromotionCandidate[]): {
  line_effects: PromotionLineEffect[];
  order_discount?: PromotionOrderEffectWithSource;
  total_discount: number;
  line_owner: Record<string, string>;
} {
  const bestByLine = new Map<string, { effect: PromotionLineEffect; promotionId: string }>();
  let bestOrder: PromotionOrderEffectWithSource | undefined;

  for (const candidate of candidates) {
    if (!candidate.eligible) continue;
    for (const effect of candidate.line_effects) {
      const current = bestByLine.get(effect.line_id);
      if (!current || effect.discount_value > current.effect.discount_value) {
        bestByLine.set(effect.line_id, { effect, promotionId: candidate.promotion_id });
      }
    }
    if (candidate.order_discount) {
      if (!bestOrder || candidate.order_discount.discount_amount > bestOrder.discount_amount) {
        bestOrder = { ...candidate.order_discount, promotion_id: candidate.promotion_id };
      }
    }
  }

  const lineEffects = Array.from(bestByLine.values()).map((v) => v.effect);
  const lineOwner: Record<string, string> = {};
  for (const [lineId, v] of bestByLine) lineOwner[lineId] = v.promotionId;

  const total = round2(
    lineEffects.reduce((s, e) => s + e.discount_value, 0) + (bestOrder?.discount_amount ?? 0)
  );
  return { line_effects: lineEffects, order_discount: bestOrder, total_discount: total, line_owner: lineOwner };
}

export interface PromotionOrderEffectWithSource {
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  matched_rule_label: string;
  promotion_id: string;
}
