import { NextResponse } from "next/server";
import { deleteCategory } from "@/lib/products/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const success = await deleteCategory(id);
    if (!success) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete category API failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete category." },
      { status: 500 }
    );
  }
}
