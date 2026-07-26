// ⚠️ FILE NÀY PHẢI KHÔNG ĐỤNG DATABASE (xem ghi chú đầu ./types.ts).
// zod schema dùng CHUNG cho API route và form — để client/server không bao giờ
// validate lệch nhau. Repository vẫn gọi lại validate lần nữa, không tin route.

import { z } from "zod";

const productRefSchema = z.object({
  product_id: z.string().uuid("Sản phẩm không hợp lệ."),
  product_name: z.string().default(""),
  product_sku: z.string().default(""),
  unit: z.string().optional(),
  image_url: z.string().optional(),
});

const discountTypeSchema = z.enum(["amount", "percent"]);

function percentGuard<T extends { discount_type: "amount" | "percent"; discount_value: number }>(v: T): boolean {
  return v.discount_type !== "percent" || v.discount_value <= 100;
}

const orderTotalRulesSchema = z.object({
  kind: z.literal("order_total"),
  tiers: z
    .array(
      z
        .object({
          row_id: z.string().default(""),
          min_order_total: z.number().min(0, "Giá trị đơn tối thiểu không được âm."),
          discount_type: discountTypeSchema,
          discount_value: z.number().min(0, "Chiết khấu không được âm."),
        })
        .refine(percentGuard, { message: "Chiết khấu phần trăm tối đa 100%.", path: ["discount_value"] })
    )
    .min(1, "Cần ít nhất 1 bậc chiết khấu."),
  })
  .refine(
    (r) => new Set(r.tiers.map((t) => t.min_order_total)).size === r.tiers.length,
    { message: "Các bậc không được trùng mức giá trị đơn hàng.", path: ["tiers"] }
  );

const perProductRulesSchema = z.object({
  kind: z.literal("per_product"),
  products: z.array(productRefSchema).min(1, "Cần chọn ít nhất 1 sản phẩm."),
  min_quantity: z.number().int().min(1, "Số lượng tối thiểu phải từ 1."),
  discount_type: discountTypeSchema,
  discount_value: z.number().min(0, "Chiết khấu không được âm."),
  quantity_cap: z.number().int().min(1).nullable().default(null),
})
  .refine(percentGuard, { message: "Chiết khấu phần trăm tối đa 100%.", path: ["discount_value"] })
  .refine((r) => r.discount_value > 0, { message: "Chiết khấu phải lớn hơn 0.", path: ["discount_value"] })
  .refine(
    (r) => new Set(r.products.map((p) => p.product_id)).size === r.products.length,
    { message: "Sản phẩm bị trùng trong danh sách.", path: ["products"] }
  );

const byQuantityRulesSchema = z.object({
  kind: z.literal("by_quantity"),
  rows: z
    .array(
      z
        .object({
          row_id: z.string().default(""),
          product_id: z.string().uuid("Chọn sản phẩm cho dòng này."),
          product_name: z.string().default(""),
          product_sku: z.string().default(""),
          image_url: z.string().optional(),
          qty_from: z.number().int().min(1, "SL từ phải ≥ 1."),
          qty_to: z.number().int().min(1).nullable().default(null),
          discount_type: discountTypeSchema,
          discount_value: z.number().min(0, "Chiết khấu không được âm."),
        })
        .refine((r) => r.qty_to === null || r.qty_to >= r.qty_from, {
          message: "SL đến phải ≥ SL từ.",
          path: ["qty_to"],
        })
        .refine((r) => r.discount_value > 0, { message: "Chiết khấu phải lớn hơn 0.", path: ["discount_value"] })
        .refine(percentGuard, { message: "Chiết khấu phần trăm tối đa 100%.", path: ["discount_value"] })
    )
    .min(1, "Cần ít nhất 1 dòng điều kiện."),
  })
  // CỐ Ý KHÔNG chặn khoảng chồng nhau: dữ liệu Sapo thật có 20→∞ và 20→49 cùng
  // 1 sản phẩm (xem ảnh mẫu). Engine đã có tie-break xác định (ưu tiên mức lợi
  // nhất cho khách). Chỉ chặn dòng TRÙNG HOÀN TOÀN vì đó là nhiễu vô nghĩa.
  .refine(
    (r) => {
      const keys = r.rows.map(
        (x) => `${x.product_id}|${x.qty_from}|${x.qty_to ?? "inf"}|${x.discount_type}|${x.discount_value}`
      );
      return new Set(keys).size === keys.length;
    },
    { message: "Có dòng điều kiện trùng lặp hoàn toàn.", path: ["rows"] }
  );

const addonRulesSchema = z.object({
  kind: z.literal("addon_by_order_total"),
  min_order_total: z.number().min(0, "Giá trị đơn tối thiểu không được âm."),
  addon_products: z.array(productRefSchema).min(1, "Cần chọn ít nhất 1 sản phẩm mua thêm."),
  discount_type: discountTypeSchema,
  discount_value: z.number().min(0, "Chiết khấu không được âm."),
  quantity_cap: z.number().int().min(1).nullable().default(null),
  threshold_excludes_addons: z.boolean().default(true),
})
  .refine(percentGuard, { message: "Chiết khấu phần trăm tối đa 100%.", path: ["discount_value"] })
  .refine((r) => r.discount_value > 0, { message: "Chiết khấu phải lớn hơn 0.", path: ["discount_value"] });

/** Dùng union thường (không phải discriminatedUnion) vì các nhánh đã có .refine
 *  nên là ZodEffects — discriminatedUnion không nhận ZodEffects. */
export const promotionRulesSchema = z.union([
  orderTotalRulesSchema,
  perProductRulesSchema,
  byQuantityRulesSchema,
  addonRulesSchema,
]);

const promotionBaseSchema = z.object({
  code: z
    .string()
    .regex(/^[A-Za-z0-9_-]{2,50}$/, "Mã khuyến mại chỉ gồm chữ, số, gạch ngang/dưới (2-50 ký tự).")
    .optional(),
  name: z.string().trim().min(1, "Tên khuyến mại không được để trống.").max(255),
  description: z.string().max(2000).default(""),
  promo_type: z.enum(["discount", "gift"]).default("discount"),
  method: z.enum(["order_total", "per_product", "by_quantity", "addon_by_order_total"]),
  status: z.enum(["draft", "active", "paused", "ended"]).default("active"),
  rules: promotionRulesSchema,
  usage_limit: z.number().int().min(1, "Số lượng áp dụng phải lớn hơn 0.").nullable().default(null),
  starts_at: z.string().optional(),
  ends_at: z.string().nullable().default(null),
  priority: z.number().int().default(0),
  created_by: z.string().max(255).optional(),
});

function crossFieldChecks(v: z.infer<typeof promotionBaseSchema>, ctx: z.RefinementCtx) {
  // v1 chặn 'gift' ở TẦNG SCHEMA (dùng chung route + repository), không phải chỉ disable nút.
  if (v.promo_type === "gift") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Loại khuyến mại 'Tặng sản phẩm' sắp có, chưa sử dụng được.",
      path: ["promo_type"],
    });
  }
  if (v.rules && (v.rules as { kind?: string }).kind !== v.method) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cấu hình điều kiện không khớp phương thức khuyến mại đã chọn.",
      path: ["rules"],
    });
  }
  if (v.starts_at && v.ends_at && new Date(v.ends_at).getTime() < new Date(v.starts_at).getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ngày kết thúc phải sau ngày bắt đầu.",
      path: ["ends_at"],
    });
  }
}

export const createPromotionSchema = promotionBaseSchema.superRefine(crossFieldChecks);

/** .partial() phải gọi TRÊN object gốc — không gọi được trên ZodEffects. */
export const updatePromotionSchema = promotionBaseSchema.partial().superRefine((v, ctx) => {
  if (v.promo_type === "gift") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Loại khuyến mại 'Tặng sản phẩm' sắp có, chưa sử dụng được.",
      path: ["promo_type"],
    });
  }
  if (v.rules && v.method && (v.rules as { kind?: string }).kind !== v.method) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cấu hình điều kiện không khớp phương thức khuyến mại đã chọn.",
      path: ["rules"],
    });
  }
  if (v.starts_at && v.ends_at && new Date(v.ends_at).getTime() < new Date(v.starts_at).getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ngày kết thúc phải sau ngày bắt đầu.",
      path: ["ends_at"],
    });
  }
});

export const promotionStatusSchema = z.object({
  status: z.enum(["draft", "active", "paused", "ended"]),
});

// ─── /api/promotions/apply ──────────────────────────────────────────────────

export const applyCartItemSchema = z.object({
  line_id: z.string().min(1),
  product_id: z.string().uuid().nullable(),
  product_name: z.string().default(""),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0),
  discount_type: z.enum(["amount", "percent"]).optional(),
  discount_value: z.number().min(0).optional(),
});

export const applyPromotionsSchema = z.object({
  items: z.array(applyCartItemSchema).min(1, "Giỏ hàng trống."),
  order_discount_type: z.enum(["amount", "percent"]).optional(),
  order_discount_value: z.number().min(0).optional(),
  include_ineligible: z.boolean().default(false),
  /** Chỉ đánh giá lại các CTKM chỉ định (dùng khi giỏ đổi sau lúc đã áp). */
  promotion_ids: z.array(z.string().uuid()).optional(),
});

export type CreatePromotionPayload = z.infer<typeof createPromotionSchema>;
export type UpdatePromotionPayload = z.infer<typeof updatePromotionSchema>;
export type ApplyPromotionsPayload = z.infer<typeof applyPromotionsSchema>;
