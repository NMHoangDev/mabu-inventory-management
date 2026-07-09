import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getShippingSettings,
  updateShippingSettings,
  DIMENSION_LABELS,
  REQUIREMENT_LABELS,
} from "@/lib/shipping/settings-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getShippingSettings();
    return NextResponse.json({
      settings,
      dimension_labels: DIMENSION_LABELS,
      requirement_labels: REQUIREMENT_LABELS,
    });
  } catch (error) {
    console.error("GET /api/shipping/settings failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings." },
      { status: 500 }
    );
  }
}

const pickupSchema = z.object({
  id: z.string(),
  label: z.string(),
  address: z.string(),
  is_default: z.boolean().optional(),
});

// Trước đây trang /shipping/config tab "Cấu hình phí" chỉ tồn tại trong React
// state — bấm lưu không gửi lên đây (route chỉ nhận general settings), refresh
// mất hết. fee_rules giờ có cột jsonb thật (shipping_settings.fee_rules, thêm
// ở SCHEMA_VERSION 20).
const feeRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  carrier: z.string(),
  from_province: z.string(),
  to_province: z.string(),
  base_fee: z.number().min(0),
  per_kg_fee: z.number().min(0),
  free_shipping_threshold: z.number().min(0),
  enabled: z.boolean(),
});

const updateSchema = z.object({
  weight_source: z.enum(["order", "custom"]).optional(),
  default_weight_g: z.number().min(0).optional(),
  default_dimension: z.enum(["default", "large", "extra_large"]).optional(),
  default_requirement: z.enum(["view_only", "no_view", "try_allowed"]).optional(),
  default_note: z.string().optional(),
  auto_sync_returned_status: z.boolean().optional(),
  auto_sync_cod: z.boolean().optional(),
  pickup_warning_days: z.number().int().min(0).max(60).optional(),
  delivery_warning_days: z.number().int().min(0).max(60).optional(),
  restricted_zones: z.string().optional(),
  pickup_addresses: z.array(pickupSchema).optional(),
  fee_rules: z.array(feeRuleSchema).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const settings = await updateShippingSettings(parsed.data);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("POST /api/shipping/settings failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save settings." },
      { status: 500 }
    );
  }
}
