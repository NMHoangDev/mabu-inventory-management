import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createCustomerGroup,
  getCustomerGroupsWithCount,
} from "@/lib/customers/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const groups = await getCustomerGroupsWithCount();
    return NextResponse.json({ groups });
  } catch (error) {
    console.error("GET /api/customer-groups failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load customer groups." },
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
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const group = await createCustomerGroup(parsed.data);
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error("POST /api/customer-groups failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create customer group." },
      { status: 500 }
    );
  }
}
