import { NextResponse } from "next/server";
import { getCurrentCustomer, toPublicCustomer } from "@/lib/customers/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ customer: null });
  return NextResponse.json({ customer: toPublicCustomer(customer) });
}
