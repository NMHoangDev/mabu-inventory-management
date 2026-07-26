import { NextResponse } from "next/server";
import {
  listPromotions,
  createPromotion,
  type PromotionFilters,
} from "@/lib/promotions/repository";
import { createPromotionSchema } from "@/lib/promotions/validation";
import type { PromotionMethod, PromotionStatus, PromotionType } from "@/lib/promotions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickEnum<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

const STATUSES = ["draft", "active", "paused", "ended"] as const;
const METHODS = ["order_total", "per_product", "by_quantity", "addon_by_order_total"] as const;
const TYPES = ["discount", "gift"] as const;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters: PromotionFilters = {
      search: url.searchParams.get("search") || url.searchParams.get("q") || undefined,
      tab: url.searchParams.get("tab") === "running" ? "running" : "all",
      status: pickEnum<PromotionStatus>(url.searchParams.get("status"), STATUSES),
      method: pickEnum<PromotionMethod>(url.searchParams.get("method"), METHODS),
      promo_type: pickEnum<PromotionType>(url.searchParams.get("promo_type"), TYPES),
      page: Number(url.searchParams.get("page")) || 1,
      page_size: Number(url.searchParams.get("page_size") || url.searchParams.get("limit")) || 20,
    };
    return NextResponse.json(await listPromotions(filters));
  } catch (error) {
    console.error("GET /api/promotions failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách khuyến mại." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createPromotionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const created = await createPromotion(parsed.data as any);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/promotions failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được khuyến mại." },
      { status: 500 }
    );
  }
}
