import { GoogleGenAI } from "@google/genai";
import { AssistantMessage, AssistantDataView } from "./types";
import {
  classifyIntent,
  runAssistantSql,
  runCannedIntent,
} from "./repository";

// ──────────────────────────────────────────────────────────────────────
// Gemini client (reuse env vars from scan flow)
// ──────────────────────────────────────────────────────────────────────

const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModels = (process.env.GEMINI_MODELS ?? "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash").split(",").map((s) => s.trim()).filter(Boolean);
const geminiMaxRetries = Math.max(0, Number(process.env.GEMINI_MAX_RETRIES ?? 2));

let cachedClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  if (!geminiApiKey) return null;
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: geminiApiKey });
  }
  return cachedClient;
}

// Simple in-process rate limit + LRU cache for canned intents
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 5;
const CACHE_TTL_MS = 5_000;
const assistantRateLimit = new Map<string, { count: number; firstAt: number }>();
const assistantCache = new Map<string, { ts: number; data: AssistantDataView; message: AssistantMessage }>();

// ──────────────────────────────────────────────────────────────────────
// System prompt — tells the model how to answer in Vietnamese
// ──────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Bạn là "Trợ lý AI" của một cửa hàng bán lẻ Việt Nam, dùng dữ liệu từ hệ thống InvoiceFlow.
Trả lời các câu hỏi kinh doanh của chủ cửa hàng bằng tiếng Việt, ngắn gọn, thân thiện, đi thẳng vào số liệu.

Có 2 cách trả lời:
1. CÂU HỎI THƯỜNG GẶP (doanh thu, top sản phẩm, hàng sắp hết, khách nợ...) → hệ thống tự trả lời bằng số liệu thật từ database. Bạn chỉ cần diễn giải lại số liệu đó thành câu trả lời tự nhiên, thêm gợi ý hành động nếu phù hợp.
2. CÂU HỎI TÙY BIẾN (cần SQL) → bạn sinh ra một câu SQL PostgreSQL hợp lệ để lấy dữ liệu. CHỈ ĐỌC. Bảng được phép: products, product_variants, product_catalog, orders, order_items, customers, customer_groups, customer_addresses, shippings, shipping_events, shipping_settings, invoice_documents, invoice_rows.

QUY TẮC QUAN TRỌNG:
- Luôn kèm đơn vị VND/đ khi nói về tiền.
- Khi số liệu bằng 0, nói "Chưa có dữ liệu" thay vì "0 đ".
- Nếu câu hỏi không liên quan đến dữ liệu cửa hàng, từ chối lịch sự.
- Không bịa số liệu. Nếu không chắc, nói rõ.
- Gợi ý 1-2 hành động cụ thể cho chủ cửa hàng sau mỗi câu trả lời.

Định dạng trả lời JSON:
{
  "answer": "Câu trả lời tiếng Việt tự nhiên, có thể dùng emoji 📊📦💰 để trực quan.",
  "sql": "SELECT ... (chỉ khi cần custom query; nếu không thì để trống)",
  "needs_sql": true/false
}`;

// ──────────────────────────────────────────────────────────────────────
// Ask the assistant (short answer for a single user message)
// ──────────────────────────────────────────────────────────────────────

export interface AssistantAskInput {
  question: string;
  /** Optional prior messages for context */
  history?: AssistantMessage[];
}

export interface AssistantAskResult {
  message: AssistantMessage;
  data?: AssistantDataView;
}

export async function askAssistant(input: AssistantAskInput): Promise<AssistantAskResult> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const question = (input.question ?? "").trim();
  if (!question) {
    return {
      message: {
        id,
        role: "assistant",
        content: "Bạn chưa nhập câu hỏi.",
        created_at: now,
      },
    };
  }

  // Simple per-process rate limit + LRU cache for canned intents
  const key = question.toLowerCase();
  const now2 = Date.now();
  const rl = assistantRateLimit.get(key) ?? { count: 0, firstAt: now2 };
  if (now2 - rl.firstAt > RATE_LIMIT_WINDOW_MS) {
    rl.count = 0;
    rl.firstAt = now2;
  }
  rl.count += 1;
  assistantRateLimit.set(key, rl);
  if (rl.count > RATE_LIMIT_MAX) {
    return {
      message: {
        id,
        role: "assistant",
        content: "Bạn hỏi quá nhanh. Vui lòng đợi vài giây rồi thử lại.",
        created_at: now,
      },
    };
  }

  // Cache hit (5s TTL for canned answers)
  const cacheKey = "canned:" + key;
  const cached = assistantCache.get(cacheKey);
  if (cached && now2 - cached.ts < CACHE_TTL_MS) {
    return {
      data: cached.data,
      message: { ...cached.message, id, created_at: now },
    };
  }

  // 1. Try canned intent first (instant answers)
  const intent = classifyIntent(question);
  if (intent) {
    const canned = await runCannedIntent(intent);
    if (canned) {
      const result: AssistantAskResult = {
        data: canned,
        message: {
          id,
          role: "assistant",
          content: summarizeCanned(question, canned),
          data: canned,
          created_at: now,
        },
      };
      // Cap cache size
      if (assistantCache.size > 100) {
        const firstKey = assistantCache.keys().next().value;
        if (firstKey) assistantCache.delete(firstKey);
      }
      assistantCache.set(cacheKey, { ts: now2, data: canned, message: result.message });
      return result;
    }
  }

  // 2. Fall back to Gemini (if configured)
  const client = getClient();
  if (client) {
    try {
      const genResult = await callGemini(client, input);
      if (genResult.needs_sql && genResult.sql) {
        const data = await runAssistantSql(genResult.sql);
        if (data) {
          const view: AssistantDataView = {
            columns: data.columns,
            rows: data.rows,
            visualization: data.rows.length === 1 && data.columns.length <= 2 ? "number" : "table",
            title: genResult.answer_title,
          };
          return {
            data: view,
            message: {
              id,
              role: "assistant",
              content: genResult.answer,
              sql: genResult.sql,
              data: view,
              created_at: now,
            },
          };
        }
        // SQL failed → still return the natural language answer
        return {
          message: {
            id,
            role: "assistant",
            content: genResult.answer + "\n\n_(Không thể truy vấn số liệu chi tiết, vui lòng thử lại.)_",
            sql: genResult.sql,
            created_at: now,
          },
        };
      }
      return {
        message: {
          id,
          role: "assistant",
          content: genResult.answer,
          created_at: now,
        },
      };
    } catch (err) {
      console.warn("Gemini assistant failed:", err);
    }
  }

  // 3. Last-resort: friendly fallback
  return {
    message: {
      id,
      role: "assistant",
      content:
        "Xin lỗi, tôi chưa có AI để trả lời câu hỏi này (chưa cấu hình GEMINI_API_KEY). Bạn có thể hỏi các câu nhanh: doanh thu hôm nay / tuần / tháng, top sản phẩm bán chạy, hàng sắp hết, khách chưa thanh toán.",
      created_at: now,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Gemini wrapper with retries
// ──────────────────────────────────────────────────────────────────────

interface GeminiGenResult {
  answer: string;
  sql?: string;
  needs_sql: boolean;
  answer_title?: string;
}

async function callGemini(client: GoogleGenAI, input: AssistantAskInput): Promise<GeminiGenResult> {
  const historyText = (input.history ?? [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Khách" : "Trợ lý"}: ${m.content}`)
    .join("\n");

  const userPrompt = `${historyText ? "Hội thoại trước:\n" + historyText + "\n\n" : ""}Câu hỏi mới: ${input.question}`;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= geminiMaxRetries; attempt++) {
    for (const modelName of geminiModels) {
      try {
        const resp = await client.models.generateContent({
          model: modelName,
          contents: [
            { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + userPrompt }] },
          ],
          config: {
            temperature: 0.3,
            responseMimeType: "application/json",
            maxOutputTokens: 1024,
          },
        });
        const text = resp.text?.trim() ?? "";
        const parsed = safeParseJson(text);
        if (!parsed) continue;
        return {
          answer: String(parsed.answer ?? "").trim() || "Tôi chưa trả lời được.",
          sql: typeof parsed.sql === "string" ? parsed.sql.trim() : undefined,
          needs_sql: Boolean(parsed.needs_sql),
          answer_title: typeof parsed.answer_title === "string" ? parsed.answer_title : undefined,
        };
      } catch (err) {
        lastErr = err;
        console.warn(`Gemini ${modelName} attempt ${attempt + 1} failed:`, err);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gemini failed");
}

function safeParseJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract first {...} block
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Natural language summarizer for canned answers
// ──────────────────────────────────────────────────────────────────────

function summarizeCanned(question: string, data: AssistantDataView): string {
  if (data.visualization === "number" && data.metric_value) {
    let trend = "";
    if (data.trend && data.trend.direction !== "flat") {
      const sign = data.trend.direction === "up" ? "📈 tăng" : "📉 giảm";
      trend = `\n\nSo với kỳ trước: ${sign} ${data.trend.percent}%.`;
    }
    return `${data.metric_value} ${data.metric_label ?? ""}${trend}\n\n${
      data.title ? "_" + data.title + "_" : ""
    }`.trim();
  }
  if (data.visualization === "bar" && data.rows.length > 0) {
    const top = data.rows[0] as Record<string, any>;
    return `🥇 **${top.name}** dẫn đầu với doanh thu ${Number(top.revenue).toLocaleString("vi-VN")} đ.\n\nCó ${
      data.rows.length
    } sản phẩm nổi bật trong 30 ngày qua. Xem chi tiết trong bảng bên dưới.`;
  }
  if (data.visualization === "table") {
    if (data.rows.length === 0) {
      return `✅ Hiện tại không có dữ liệu nào trong mục **${data.title ?? "này"}**. Bạn có thể tiếp tục theo dõi.`;
    }
    return `Tìm thấy **${data.rows.length}** mục trong **${data.title ?? "kết quả"}**. Xem chi tiết bên dưới.`;
  }
  return "Đã chuẩn bị xong dữ liệu.";
}
