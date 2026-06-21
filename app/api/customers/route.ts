import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createCustomer,
  deleteCustomer,
  getCustomerById,
  getCustomerGroups,
  getCustomers,
  updateCustomer,
} from "@/lib/customers/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const searchParamsSchema = z.object({
  search: z.string().default(""),
  group_id: z.string().default(""),
  tab: z.string().default(""),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const opts = searchParamsSchema.parse({
      search: searchParams.get("search") ?? "",
      group_id: searchParams.get("group_id") ?? "",
      tab: searchParams.get("tab") ?? "",
    });

    const [customers, groups] = await Promise.all([
      getCustomers(opts),
      getCustomerGroups(),
    ]);

    return NextResponse.json({ customers, groups });
  } catch (error) {
    console.error("GET /api/customers failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load customers." },
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  name: z.string().min(1, "Tên khách hàng là bắt buộc."),
  code: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  birthday: z.string().optional(),
  company: z.string().optional(),
  tax_code: z.string().optional(),
  website: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  group_id: z.string().optional(),
  assigner_id: z.string().optional(),
  addresses: z
    .array(
      z.object({
        is_default: z.boolean().default(false),
        recipient_name: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        ward: z.string().optional(),
        district: z.string().optional(),
        city: z.string().optional(),
        region: z.string().optional(),
        postal_code: z.string().optional(),
        address_type: z.enum(["shipping", "billing", "other"]).default("shipping"),
      })
    )
    .default([]),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const customer = await createCustomer(parsed.data);
    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create customer." },
      { status: 500 }
    );
  }
}
