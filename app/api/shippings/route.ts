import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createShipping,
  getShippingStats,
  listShippings,
  SHIPPING_STATUS_LABEL,
} from "@/lib/shipping/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    const status = (url.searchParams.get("status") ?? undefined) as any;
    const partner = (url.searchParams.get("partner") ?? undefined) as any;
    const date_from = url.searchParams.get("date_from") ?? undefined;
    const date_to = url.searchParams.get("date_to") ?? undefined;
    const page = Number(url.searchParams.get("page") ?? 1);
    const page_size = Number(url.searchParams.get("page_size") ?? 20);

    const [list, stats] = await Promise.all([
      listShippings({ search, status, partner, date_from, date_to, page, page_size }),
      getShippingStats(),
    ]);

    return NextResponse.json({
      ...list,
      stats,
      status_labels: SHIPPING_STATUS_LABEL,
    });
  } catch (error) {
    console.error("GET /api/shippings failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load shippings." },
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  tracking_code: z.string().optional(),
  order_id: z.string().nullable().optional(),
  customer_name: z.string().min(1, "Tên người nhận là bắt buộc"),
  customer_phone: z.string().optional(),
  shipping_address: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  ward: z.string().optional(),
  partner: z.string().optional(),
  partner_service: z.string().optional(),
  status: z
    .enum([
      "pending",
      "packing",
      "awaiting_pickup",
      "shipping",
      "delivered",
      "returning",
      "cancelled",
      "returned",
      "failed",
    ])
    .optional(),
  cod_amount: z.number().min(0).optional(),
  shipping_fee: z.number().min(0).optional(),
  weight: z.number().min(0).optional(),
  note: z.string().optional(),
  branch: z.string().optional(),
  staff: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const shipping = await createShipping(parsed.data);
    return NextResponse.json(shipping, { status: 201 });
  } catch (error) {
    console.error("POST /api/shippings failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create shipping." },
      { status: 500 }
    );
  }
}
