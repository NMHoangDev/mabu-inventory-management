import { NextResponse } from "next/server";
import { getNextPromotionCode } from "@/lib/promotions/repository";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("promotions.view");
  if (guard) return guard;
  try {
    return NextResponse.json({ code: await getNextPromotionCode() });
  } catch (error) {
    console.error("GET /api/promotions/next-code failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không sinh được mã khuyến mại." },
      { status: 500 }
    );
  }
}
