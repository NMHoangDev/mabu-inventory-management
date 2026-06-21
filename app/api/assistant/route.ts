import { NextResponse } from "next/server";
import { z } from "zod";
import { askAssistant } from "@/lib/assistant/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  created_at: z.string().optional(),
});

const schema = z.object({
  question: z.string().min(1, "Câu hỏi không được trống.").max(500),
  history: z.array(messageSchema).max(20).optional(),
});

// Simple in-process rate limit (10 req per 10s)
declare global {
  // eslint-disable-next-line no-var
  var invoiceflowAssistantRateLimit: { count: number; firstAt: number }[] | undefined;
}
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(): boolean {
  if (!globalThis.invoiceflowAssistantRateLimit) {
    globalThis.invoiceflowAssistantRateLimit = [];
  }
  const now = Date.now();
  // Clean old entries
  globalThis.invoiceflowAssistantRateLimit = globalThis.invoiceflowAssistantRateLimit.filter(
    (e) => now - e.firstAt < RATE_LIMIT_WINDOW_MS
  );
  if (globalThis.invoiceflowAssistantRateLimit.length >= RATE_LIMIT_MAX) return false;
  globalThis.invoiceflowAssistantRateLimit.push({ count: 1, firstAt: now });
  return true;
}

export async function POST(request: Request) {
  if (!checkRateLimit()) {
    return NextResponse.json(
      { error: "Quá nhiều yêu cầu. Vui lòng đợi vài giây." },
      { status: 429 }
    );
  }
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body phải là JSON hợp lệ." },
      { status: 400 }
    );
  }
  try {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Câu hỏi không hợp lệ.", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const result = await askAssistant({
      question: parsed.data.question,
      history: (parsed.data.history ?? []).map((m) => ({ ...m, created_at: m.created_at ?? new Date().toISOString() })),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/assistant failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Assistant error" },
      { status: 500 }
    );
  }
}
