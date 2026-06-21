import { NextResponse } from "next/server";
import { z } from "zod";
import { appendShippingEvent } from "@/lib/shipping/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.string(),
  description: z.string().default(""),
  location: z.string().default(""),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    await appendShippingEvent(id, parsed.data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/shippings/[id]/events failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to append event." },
      { status: 500 }
    );
  }
}
