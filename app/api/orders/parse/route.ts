import { NextResponse } from "next/server";
import { z } from "zod";
import {
  parseOrderFromText,
  applyOrderDraft,
  type ParsedOrderDraft,
} from "@/lib/orders/ai-parse";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple in-process rate limit for expensive AI endpoints
declare global {
  // eslint-disable-next-line no-var
  var invoiceflowParseRateLimit: Map<string, { count: number; firstAt: number }> | undefined;
}
// Rate limit key: hash toàn bộ text thay vì lấy 64 ký tự đầu.
// Trước đây dùng slice(0, 64) → user bypass được bằng cách đổi phần đuôi text.
function hashForRateLimit(text: string): string {
  // djb2 hash — đủ nhanh và đủ tốt cho rate limit key (không cần crypto)
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return "text:" + (hash >>> 0).toString(36);
}

function getRateLimit() {
  if (!globalThis.invoiceflowParseRateLimit) {
    globalThis.invoiceflowParseRateLimit = new Map();
  }
  return globalThis.invoiceflowParseRateLimit;
}
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 8;

function checkRateLimit(key: string): boolean {
  const map = getRateLimit();
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now - entry.firstAt > RATE_LIMIT_WINDOW_MS) {
    map.set(key, { count: 1, firstAt: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

const parseSchema = z.object({
  text: z.string().min(1),
});

const applySchema = z.object({
  mode: z.literal("apply"),
  // Bắt buộc các trường tối thiểu — runtime validate sâu hơn trong applyOrderDraft.
  // Tránh tình trạng client gửi object rỗng / sai kiểu vẫn pass schema rồi crash giữa chừng.
  draft: z.object({
    customer_name: z.string(),
    customer_phone: z.string(),
    customer_address: z.string().optional(),
    note: z.string().optional(),
    source: z.enum(["store", "facebook", "zalo", "website", "other"]),
    items: z.array(
      z.object({
        product_name: z.string(),
        sku: z.string().optional(),
        quantity: z.number().nonnegative(),
        unit_price: z.number().nonnegative().optional(),
        matched_product_id: z.string().optional(),
        matched_sku: z.string().optional(),
        confidence: z.enum(["high", "medium", "low"])
      })
    ),
    subtotal: z.number().nonnegative(),
    discount: z.number().nonnegative(),
    shipping_fee: z.number().nonnegative(),
    total: z.number().nonnegative()
  }),
  staff: z.string().optional(),
  branch: z.string().optional(),
  auto_match: z.boolean().optional(),
});

export async function POST(request: Request) {
  const guard = await requirePermission("orders.create");
  if (guard) return guard;
  try {
    const contentType = request.headers.get("content-type") ?? "";

    // ── Image upload (multipart) ──
    if (contentType.includes("multipart/form-data")) {
      if (!checkRateLimit("ip:parse-image")) {
        return NextResponse.json({ error: "Bạn gửi quá nhanh. Vui lòng đợi vài giây." }, { status: 429 });
      }
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing file" }, { status: 400 });
      }
      // Cap image size at 8MB to avoid huge Gemini calls
      if (file.size > 8 * 1024 * 1024) {
        return NextResponse.json({ error: "Ảnh quá lớn (tối đa 8MB)." }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const { parseOrderFromImage } = await import("@/lib/orders/ai-parse");
      const draft = await parseOrderFromImage(buffer, file.type || "image/jpeg");
      if (!draft) {
        return NextResponse.json({ error: "AI chưa trích xuất được đơn. Hãy thêm GEMINI_API_KEY hoặc thử ảnh rõ hơn." }, { status: 400 });
      }
      const { matchProductsForItems } = await import("@/lib/orders/ai-parse");
      draft.items = await matchProductsForItems(draft.items);
      return NextResponse.json({ draft });
    }

    // ── JSON body ──
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body phải là JSON hợp lệ." }, { status: 400 });
    }
    if (body?.mode === "apply") {
      const parsed = applySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        );
      }
      const result = await applyOrderDraft(parsed.data.draft as ParsedOrderDraft, {
        staff: parsed.data.staff,
        branch: parsed.data.branch,
        auto_match: parsed.data.auto_match,
      });
      if (!result.success) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    const parsed = parseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    if (!checkRateLimit(hashForRateLimit(parsed.data.text))) {
      return NextResponse.json({ error: "Bạn gửi quá nhanh. Vui lòng đợi vài giây." }, { status: 429 });
    }
    const draft = await parseOrderFromText(parsed.data.text);
    if (!draft) {
      return NextResponse.json({ error: "AI chưa trích xuất được đơn." }, { status: 400 });
    }
    const { matchProductsForItems } = await import("@/lib/orders/ai-parse");
    draft.items = await matchProductsForItems(draft.items);
    return NextResponse.json({ draft });
  } catch (error) {
    console.error("POST /api/orders/parse failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
