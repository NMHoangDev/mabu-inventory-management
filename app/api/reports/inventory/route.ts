import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";
import {
  queryInventorySummary,
  queryInventoryDetail,
  queryInventoryLedger,
  queryInventoryBelowThreshold,
  queryInventoryAboveThreshold,
  queryInventoryInOut,
  queryInventoryStockCheck
} from "@/lib/reports/inventory-queries";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requirePermission("reports.view_inventory");
  if (guard) return guard;
  try {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("date_from") ?? "";
    const dateTo = url.searchParams.get("date_to") ?? "";
    const groupBy = url.searchParams.get("group_by") ?? "summary";
    // group_by: summary | detail | ledger | below_threshold | above_threshold | in_out | stock_check

    if (!isDatabaseConfigured) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    await ensureDatabase();
    const pool = getPool();

    if (groupBy === "summary") {
      return NextResponse.json(await queryInventorySummary(pool));
    }

    if (groupBy === "detail") {
      return NextResponse.json({ items: await queryInventoryDetail(pool, 200) });
    }

    if (groupBy === "ledger") {
      return NextResponse.json({ entries: await queryInventoryLedger(pool, dateFrom, dateTo, 200) });
    }

    if (groupBy === "below_threshold") {
      return NextResponse.json({ items: await queryInventoryBelowThreshold(pool, 100) });
    }

    if (groupBy === "above_threshold") {
      return NextResponse.json({ items: await queryInventoryAboveThreshold(pool, 100) });
    }

    if (groupBy === "in_out") {
      return NextResponse.json(await queryInventoryInOut(pool, dateFrom, dateTo, 50));
    }

    if (groupBy === "stock_check") {
      return NextResponse.json({ checks: await queryInventoryStockCheck(pool, dateFrom, dateTo, 100) });
    }

    return NextResponse.json({ error: "Unknown group_by" }, { status: 400 });
  } catch (error) {
    console.error("GET /api/reports/inventory failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lỗi server" }, { status: 500 });
  }
}
