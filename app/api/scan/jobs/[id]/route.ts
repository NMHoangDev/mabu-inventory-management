import { NextResponse } from "next/server";
import { getScanJob } from "@/lib/invoices/scan-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function routeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const job = await getScanJob(id);
    if (!job) return NextResponse.json({ error: "Không tìm thấy job scan." }, { status: 404 });
    return NextResponse.json({ job });
  } catch (error) {
    console.error("Get scan job API failed:", error);
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
