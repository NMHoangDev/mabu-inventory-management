import { NextResponse } from "next/server";
import { runTrigger } from "@/lib/automations/engine";
import { isDatabaseConfigured, getPool } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";
import { computeInventoryInsights } from "@/lib/inventory/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-process dedupe — don't run expensive tick more than once per 60s
declare global {
  // eslint-disable-next-line no-var
  var invoiceflowAutomationLastTick: number | undefined;
}

const MIN_INTERVAL_MS = 60_000;

/**
 * Server-side tick — runs periodic automations.
 * Browser pings this every 5 minutes (see AutomationBootstrap.tsx).
 * Dedupe in-process: no-op if last tick was <60s ago.
 */
export async function POST() {
  const now = Date.now();
  if (globalThis.invoiceflowAutomationLastTick && now - globalThis.invoiceflowAutomationLastTick < MIN_INTERVAL_MS) {
    return NextResponse.json({ ok: true, skipped: "rate_limited", wait_ms: MIN_INTERVAL_MS - (now - globalThis.invoiceflowAutomationLastTick) });
  }
  globalThis.invoiceflowAutomationLastTick = now;

  if (!isDatabaseConfigured) {
    return NextResponse.json({ ok: true, skipped: "no_database" });
  }
  try {
    await ensureDatabase();
    const pool = getPool();

    // 1) Inventory insights → reorder triggers
    let insights;
    try {
      insights = await computeInventoryInsights();
    } catch (err) {
      console.warn("tick: computeInventoryInsights failed (continuing):", err);
      insights = { top_suggestions: [], out_of_stock_count: 0, low_stock_count: 0 };
    }
    for (const sug of insights.top_suggestions) {
      const trigger = sug.urgency === "critical" || sug.urgency === "high" ? "reorder.critical" : "reorder.suggested";
      await runTrigger(trigger, {
        product: { id: sug.product_id, name: sug.product_name, stock: sug.current_stock },
        suggestion: sug,
      }).catch((err) => console.warn(`tick trigger ${trigger} failed:`, err));
    }
    if (insights.out_of_stock_count > 0) {
      await runTrigger("stock.out", { count: insights.out_of_stock_count }).catch((e) => console.warn(e));
    }
    if (insights.low_stock_count > 0) {
      await runTrigger("stock.low", { count: insights.low_stock_count }).catch((e) => console.warn(e));
    }

    // 2) Shipping pickup overdue
    const overdue = await pool.query(
      `select id, tracking_code, customer_name, partner, status, packed_at
         from shippings
        where status in ('pending','packing','awaiting_pickup')
          and packed_at is not null
          and packed_at < now() - interval '3 days'
        limit 20`
    );
    for (const ship of overdue.rows) {
      await runTrigger("shipping.pickup_overdue", { shipping: ship, days: 3 }).catch((e) => console.warn(e));
    }

    return NextResponse.json({ ok: true, triggered: insights.top_suggestions.length });
  } catch (err) {
    console.error("POST /api/automations/tick failed:", err);
    // Don't reset rate-limit on transient errors so we don't hammer the DB
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
