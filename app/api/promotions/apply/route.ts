import { NextResponse } from "next/server";
import { listActivePromotions } from "@/lib/promotions/repository";
import { evaluatePromotions, mergeCandidates } from "@/lib/promotions/engine";
import { applyPromotionsSchema } from "@/lib/promotions/validation";
import type { EngineCart } from "@/lib/promotions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CHỈ ĐỌC — tuyệt đối không ghi gì vào DB. Nhận snapshot giỏ hàng, trả về các
 * CTKM đủ điều kiện kèm hiệu lực đã tính sẵn. Việc cộng usage_count xảy ra ở
 * createOrder() lúc lưu đơn, không phải ở đây.
 *
 * POS sau này dùng ĐÚNG endpoint này, không cần thêm route mới.
 */
export async function POST(request: Request) {
  try {
    const parsed = applyPromotionsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu giỏ hàng không hợp lệ.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { items, order_discount_type, order_discount_value, include_ineligible, promotion_ids } =
      parsed.data;

    const cart: EngineCart = {
      items: items.map((i) => ({
        line_id: i.line_id,
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount_type: i.discount_type,
        discount_value: i.discount_value,
      })),
      order_discount_type,
      order_discount_value,
    };

    const active = await listActivePromotions();
    const pool =
      promotion_ids && promotion_ids.length > 0
        ? active.filter((p) => promotion_ids.includes(p.id))
        : active;

    const candidates = evaluatePromotions(pool, cart, { includeIneligible: include_ineligible });

    // Khi client chỉ định promotion_ids (đánh giá lại các CTKM đã áp), trả kèm
    // hiệu lực đã gộp để client ghi thẳng vào giỏ mà không phải tự merge.
    const merged =
      promotion_ids && promotion_ids.length > 0 ? mergeCandidates(candidates) : undefined;

    return NextResponse.json({
      candidates,
      best: candidates.find((c) => c.eligible) ?? null,
      merged,
      evaluated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/promotions/apply failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không kiểm tra được khuyến mại." },
      { status: 500 }
    );
  }
}
