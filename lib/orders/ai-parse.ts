import { GoogleGenAI } from "@google/genai";
import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { createOrder } from "../orders/repository";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface ParsedOrderItem {
  product_name: string;
  sku?: string;
  quantity: number;
  unit_price?: number;
  matched_product_id?: string;
  matched_sku?: string;
  confidence: "high" | "medium" | "low";
}

export interface ParsedOrderDraft {
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  note?: string;
  source: "store" | "facebook" | "zalo" | "website" | "other";
  items: ParsedOrderItem[];
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  /** Optional hint to also create shipping */
  create_shipping: boolean;
  /** Optional shipping partner hint */
  shipping_partner?: string;
}

// ──────────────────────────────────────────────────────────────────────
// Gemini client
// ──────────────────────────────────────────────────────────────────────

const apiKey = process.env.GEMINI_API_KEY;
const modelNames = (process.env.GEMINI_MODELS ?? "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash").split(",").map(s => s.trim()).filter(Boolean);

let cached: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  if (!apiKey) return null;
  if (!cached) cached = new GoogleGenAI({ apiKey });
  return cached;
}

// ──────────────────────────────────────────────────────────────────────
// Prompt
// ──────────────────────────────────────────────────────────────────────

const ORDER_PARSE_PROMPT = `Bạn là trợ lý trích xuất đơn hàng từ văn bản tiếng Việt.
Người dùng sẽ gửi tin nhắn đặt hàng (từ Messenger, Zalo, SMS, ghi chú...).
Hãy trích xuất:
- Tên khách hàng
- Số điện thoại
- Địa chỉ giao (nếu có)
- Ghi chú (nếu có)
- Danh sách sản phẩm: tên, số lượng, đơn giá (nếu có)
- Tổng tiền (nếu suy ra được)
- Nguồn đơn: facebook | zalo | website | store | other (dựa vào ngữ cảnh)

Trả về JSON DUY NHẤT, không markdown:
{
  "customer_name": "string",
  "customer_phone": "string",
  "customer_address": "string",
  "note": "string",
  "source": "facebook|zalo|website|store|other",
  "items": [
    { "product_name": "string", "quantity": number, "unit_price": number, "confidence": "high|medium|low" }
  ],
  "subtotal": number,
  "discount": 0,
  "shipping_fee": 0,
  "total": number,
  "create_shipping": true
}

Quy tắc:
- Nếu không rõ trường nào, để "" hoặc 0.
- quantity mặc định = 1 nếu không nói rõ.
- unit_price: nếu tin nhắn không có, để 0.
- total = sum(items.quantity * items.unit_price) - discount + shipping_fee.
- Một sản phẩm có thể có tên rút gọn ("áo thun đen 3 cái") → tách quantity=3, product_name="áo thun đen".
- Cố gắng hiểu tiếng Việt có dấu và không dấu.
`;

// ──────────────────────────────────────────────────────────────────────
// Parse from text
// ──────────────────────────────────────────────────────────────────────

export async function parseOrderFromText(input: string): Promise<ParsedOrderDraft | null> {
  const client = getClient();
  if (!client) return null;
  let lastErr: unknown = null;
  for (const model of modelNames) {
    try {
      const resp = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: ORDER_PARSE_PROMPT + "\n\nTin nhắn cần trích xuất:\n" + input }] }],
        config: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 1500 },
      });
      const text = resp.text?.trim() ?? "";
      const parsed = safeParseJson(text);
      if (!parsed) continue;
      return normalizeDraft(parsed);
    } catch (err) {
      lastErr = err;
      console.warn(`parseOrderFromText ${model} failed:`, err);
    }
  }
  if (lastErr) console.warn("parseOrderFromText all models failed");
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Parse from image (multipart upload from frontend)
// ──────────────────────────────────────────────────────────────────────

export async function parseOrderFromImage(buffer: Buffer, mime: string): Promise<ParsedOrderDraft | null> {
  const client = getClient();
  if (!client) return null;
  let lastErr: unknown = null;
  for (const model of modelNames) {
    try {
      const resp = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: mime, data: buffer.toString("base64") } },
              { text: ORDER_PARSE_PROMPT + "\n\nTrích xuất đơn hàng từ ảnh chụp/screenshot bên trên." },
            ],
          },
        ],
        config: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 1500 },
      });
      const text = resp.text?.trim() ?? "";
      const parsed = safeParseJson(text);
      if (!parsed) continue;
      return normalizeDraft(parsed);
    } catch (err) {
      lastErr = err;
      console.warn(`parseOrderFromImage ${model} failed:`, err);
    }
  }
  if (lastErr) console.warn("parseOrderFromImage all models failed");
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Match products by name/sku in DB
// ──────────────────────────────────────────────────────────────────────

export async function matchProductsForItems(items: ParsedOrderItem[]): Promise<ParsedOrderItem[]> {
  if (!isDatabaseConfigured) return items;
  await ensureDatabase();
  const pool = getPool();
  const out: ParsedOrderItem[] = [];
  for (const it of items) {
    let productId: string | null = null;
    let sku: string | null = null;
    let unitPrice = it.unit_price ?? 0;
    let confidence = it.confidence;

    // Try SKU exact match first
    if (it.sku) {
      const r = await pool.query(`select id, sku, price::numeric from products where sku = $1 limit 1`, [it.sku]);
      if (r.rows.length > 0) {
        productId = r.rows[0].id;
        sku = r.rows[0].sku;
        if (!unitPrice) unitPrice = Number(r.rows[0].price ?? 0);
        confidence = "high";
      }
    }

    // Try product_catalog.retail_name or adjusted_invoice_name
    if (!productId) {
      const name = (it.product_name ?? "").trim();
      if (name) {
        const r = await pool.query(
          `select id, sku, price::numeric from products
            where lower(name) = lower($1)
               or $1 = any(tags)
            limit 1`,
          [name]
        );
        if (r.rows.length > 0) {
          productId = r.rows[0].id;
          sku = r.rows[0].sku;
          if (!unitPrice) unitPrice = Number(r.rows[0].price ?? 0);
          confidence = confidence === "low" ? "medium" : confidence;
        }
      }
    }

    // Fuzzy: ILIKE contains
    if (!productId) {
      const name = (it.product_name ?? "").trim();
      if (name) {
        const r = await pool.query(
          `select id, sku, price::numeric from products
            where name ilike $1
            order by length(name) asc
            limit 1`,
          [`%${name}%`]
        );
        if (r.rows.length > 0) {
          productId = r.rows[0].id;
          sku = r.rows[0].sku;
          if (!unitPrice) unitPrice = Number(r.rows[0].price ?? 0);
          confidence = "low";
        }
      }
    }

    out.push({
      ...it,
      unit_price: unitPrice,
      matched_product_id: productId ?? undefined,
      matched_sku: sku ?? it.sku,
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Apply draft to create an actual order
// ──────────────────────────────────────────────────────────────────────

export interface ApplyResult {
  success: boolean;
  order_id?: string;
  order_code?: string;
  message: string;
}

export async function applyOrderDraft(draft: ParsedOrderDraft | any, opts: {
  staff?: string;
  branch?: string;
  auto_match?: boolean;
} = {}): Promise<ApplyResult> {
  if (!isDatabaseConfigured) {
    return { success: false, message: "Database chưa cấu hình." };
  }
  // Coerce defensive defaults
  const safeDraft = {
    customer_name: String(draft?.customer_name ?? "").trim(),
    customer_phone: String(draft?.customer_phone ?? "").trim(),
    customer_address: String(draft?.customer_address ?? "").trim(),
    note: String(draft?.note ?? "").trim(),
    source: (["store","facebook","zalo","website","other"] as const).includes(draft?.source) ? draft.source : "other",
    discount: Number(draft?.discount ?? 0) || 0,
    shipping_fee: Number(draft?.shipping_fee ?? 0) || 0,
    create_shipping: Boolean(draft?.create_shipping ?? true),
    items: Array.isArray(draft?.items) ? draft.items : [],
  };

  if (safeDraft.items.length === 0) {
    return { success: false, message: "Đơn phải có ít nhất 1 sản phẩm." };
  }
  if (!safeDraft.customer_name) {
    return { success: false, message: "Tên khách hàng là bắt buộc." };
  }

  // Optionally match products to DB first
  let items = safeDraft.items;
  if (opts.auto_match !== false) {
    try {
      items = await matchProductsForItems(items);
    } catch (err) {
      console.warn("matchProductsForItems failed (continuing with raw items):", err);
    }
  }

  // Validate rằng mọi matched_product_id tồn tại trong DB. Nếu AI parse trả về
  // id linh tinh (hallucination, id sản phẩm cũ đã xóa...) thì bỏ qua — tránh
  // tạo order_items với FK trỏ vào hư không, gây lỗi ở các query sau.
  if (isDatabaseConfigured) {
    const productIds = Array.from(
      new Set(
        items
          .map((it: any) => it.matched_product_id)
          .filter((x: any) => typeof x === "string" && x.length > 0)
      )
    );
    if (productIds.length > 0) {
      try {
        await ensureDatabase();
        const existing = await getPool().query(
          `select id from products where id = any($1::uuid[])`,
          [productIds]
        );
        const validIds = new Set(existing.rows.map((r) => String(r.id)));
        items = items.map((it: any) =>
          it.matched_product_id && !validIds.has(String(it.matched_product_id))
            ? { ...it, matched_product_id: null, matched_sku: it.sku ?? null, confidence: "low" as const }
            : it
        );
      } catch (err) {
        console.warn("validateMatchedProducts failed (continuing):", err);
      }
    }
  }

  // Re-compute totals from items
  const subtotal = items.reduce((s: number, it: any) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const total = Math.max(0, subtotal - safeDraft.discount + safeDraft.shipping_fee);

  // Create order using existing repository
  const orderInput: any = {
    customer_name: safeDraft.customer_name,
    customer_phone: safeDraft.customer_phone,
    customer_address: safeDraft.customer_address,
    source: safeDraft.source,
    staff: opts.staff || "",
    branch: opts.branch || "Chi nhánh chính",
    note: [safeDraft.note, safeDraft.create_shipping ? "[AI-PARSE] Tạo kèm vận đơn" : "[AI-PARSE]"].filter(Boolean).join(" | "),
    discount: safeDraft.discount,
    shipping_fee: safeDraft.shipping_fee,
    paid: 0,
    status: "new",
    payment_status: "unpaid",
    fulfillment_status: "unshipped",
    items: items.map((it: any) => ({
      product_id: it.matched_product_id ?? null,
      product_name: String(it.product_name ?? "Sản phẩm"),
      product_sku: String(it.matched_sku || it.sku || ""),
      unit: String(it.unit ?? ""),
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price) || 0,
      image_url: "",
    })),
  };

  try {
    const created = await createOrder(orderInput);
    return {
      success: true,
      order_id: created?.id,
      order_code: created?.code,
      message: `Đã tạo đơn ${created?.code} từ AI parse.`,
    };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Không tạo được đơn" };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function safeParseJson(text: string): any | null {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch { return null; }
  }
  return null;
}

function normalizeDraft(parsed: any): ParsedOrderDraft {
  const items = Array.isArray(parsed.items) ? parsed.items.map((it: any) => ({
    product_name: String(it.product_name ?? "").trim(),
    sku: it.sku ? String(it.sku).trim() : undefined,
    quantity: Number(it.quantity ?? 1) || 1,
    unit_price: Number(it.unit_price ?? 0) || 0,
    confidence: (["high","medium","low"] as const).includes(it.confidence) ? it.confidence : "low",
  })) : [];
  return {
    customer_name: String(parsed.customer_name ?? "").trim(),
    customer_phone: normalizePhone(String(parsed.customer_phone ?? "").trim()),
    customer_address: parsed.customer_address ? String(parsed.customer_address).trim() : "",
    note: parsed.note ? String(parsed.note).trim() : "",
    source: (["store","facebook","zalo","website","other"] as const).includes(parsed.source) ? parsed.source : "other",
    items,
    subtotal: Number(parsed.subtotal ?? 0) || 0,
    discount: Number(parsed.discount ?? 0) || 0,
    shipping_fee: Number(parsed.shipping_fee ?? 0) || 0,
    total: Number(parsed.total ?? 0) || 0,
    create_shipping: Boolean(parsed.create_shipping ?? true),
    shipping_partner: parsed.shipping_partner ? String(parsed.shipping_partner) : undefined,
  };
}

function normalizePhone(phone: string): string {
  // Convert 0xxx -> +84xxx, keep 84xxx, drop other chars
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+84")) return "0" + digits.slice(3);
  if (digits.startsWith("84") && digits.length >= 10) return "0" + digits.slice(2);
  return digits;
}
