import { NextResponse } from "next/server";
import { deleteDocument } from "@/lib/invoices/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function routeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await deleteDocument(id));
  } catch (error) {
    console.error("Delete document API failed:", error);
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}
