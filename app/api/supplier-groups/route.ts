import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupplierGroup,
  getSupplierGroupsWithCount,
} from "@/lib/suppliers/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("suppliers.view");
  if (guard) return guard;
  try {
    const groups = await getSupplierGroupsWithCount();
    return NextResponse.json({ groups });
  } catch (error) {
    console.error("GET /api/supplier-groups failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load supplier groups." },
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  name: z.string().min(1, "Tên nhóm là bắt buộc."),
  code: z.string().optional(),
  type: z.string().default("Cố định"),
  description: z.string().optional(),
});

export async function POST(request: Request) {
  const guard = await requirePermission("suppliers.create");
  if (guard) return guard;
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const group = await createSupplierGroup(parsed.data);
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error("POST /api/supplier-groups failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create supplier group." },
      { status: 500 }
    );
  }
}
