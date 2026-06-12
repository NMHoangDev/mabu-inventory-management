import { NextResponse } from "next/server";
import { createScanJob } from "@/lib/invoices/scan-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function routeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    const job = await createScanJob(files);
    return NextResponse.json({ job });
  } catch (error) {
    console.error("Create scan job API failed:", error);
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
