import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createOrder,
  getOrderStats,
  listOrders,
  OrderItemInput,
} from "@/lib/orders/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requirePermission("orders.view");
  if (guard) return guard;
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    // Enum values phải khớp với types trong lib/orders/repository.ts
    const ORDER_STATUSES = ["new", "processing", "completed", "cancelled", "all"] as const;
    const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "refunded", "all"] as const;
    const FULFILLMENT_STATUSES = ["unshipped", "confirmed", "packing", "shipping", "shipped", "returned", "all"] as const;
    const SOURCES = ["store", "facebook", "website", "zalo", "other", "pos", "all"] as const;
    function pickEnum<T extends readonly string[]>(values: T, raw: string | null): T[number] | undefined {
      if (!raw) return undefined;
      return (values as readonly string[]).includes(raw) ? (raw as T[number]) : undefined;
    }
    const status = pickEnum(ORDER_STATUSES, url.searchParams.get("status"));
    const payment_status = pickEnum(PAYMENT_STATUSES, url.searchParams.get("payment_status"));
    const fulfillment_status = pickEnum(FULFILLMENT_STATUSES, url.searchParams.get("fulfillment_status"));
    const source = pickEnum(SOURCES, url.searchParams.get("source"));
    const date_from = url.searchParams.get("date_from") ?? undefined;
    const date_to = url.searchParams.get("date_to") ?? undefined;
    const page = Number(url.searchParams.get("page") ?? 1);
    const page_size = Number(url.searchParams.get("page_size") ?? 20);

    const [list, stats] = await Promise.all([
      listOrders({ search, status, payment_status, fulfillment_status, source, date_from, date_to, page, page_size }),
      getOrderStats(),
    ]);

    return NextResponse.json({ ...list, stats });
  } catch (error) {
    console.error("GET /api/orders failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load orders." },
      { status: 500 }
    );
  }
}

const itemSchema = z.object({
  product_id: z.string().nullable(),
  product_name: z.string().min(1),
  product_sku: z.string().optional(),
  unit: z.string().optional(),
  image_url: z.string().optional(),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0),
  discount_type: z.enum(["amount", "percent"]).optional(),
  discount_value: z.number().min(0).optional(),
  note: z.string().optional(),
});

const createSchema = z.object({
  customer_id: z.string().nullable().optional(),
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
  status: z.enum(["new", "processing", "completed", "cancelled"]).optional(),
  payment_status: z.enum(["unpaid", "partial", "paid", "refunded"]).optional(),
  fulfillment_status: z.enum(["unshipped", "confirmed", "packing", "shipping", "shipped", "returned"]).optional(),
  payment_method: z.enum(["cod", "bank_transfer", "card", "cash"]).optional(),
  source: z.enum(["store", "facebook", "website", "zalo", "other", "pos"]).optional(),
  branch: z.string().optional(),
  staff: z.string().optional(),
  note: z.string().optional(),
  discount: z.number().min(0).optional(),
  discount_type: z.enum(["amount", "percent"]).optional(),
  shipping_fee: z.number().min(0).optional(),
  paid: z.number().min(0).optional(),
  items: z.array(itemSchema).min(1, "Đơn hàng phải có ít nhất 1 sản phẩm."),
  // Optional & tương thích ngược hoàn toàn: không gửi thì không có gì đổi.
  applied_promotions: z
    .array(
      z.object({
        promotion_id: z.string(),
        code: z.string().default(""),
        name: z.string().default(""),
        method: z.string().default(""),
        discount_amount: z.number().min(0).default(0),
        snapshot: z.record(z.any()).optional(),
      })
    )
    .optional(),
});

export async function POST(request: Request) {
  const guard = await requirePermission("orders.create");
  if (guard) return guard;
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const items: OrderItemInput[] = parsed.data.items;
    const order = await createOrder({ ...parsed.data, items });
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("POST /api/orders failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create order." },
      { status: 500 }
    );
  }
}
