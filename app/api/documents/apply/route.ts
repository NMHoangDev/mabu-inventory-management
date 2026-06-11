import { NextResponse } from "next/server";
import { z } from "zod";
import { applyDocumentsToSummary } from "@/lib/invoices/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const applyDocumentsSchema = z.object({
  documentIds: z.array(z.string()).default([])
});

function routeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

export async function POST(request: Request) {
  try {
    const parsed = applyDocumentsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid document list.", details: parsed.error.flatten() }, { status: 400 });
    }

    return NextResponse.json(await applyDocumentsToSummary(parsed.data.documentIds));
  } catch (error) {
    console.error("Apply documents API failed:", error);
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
