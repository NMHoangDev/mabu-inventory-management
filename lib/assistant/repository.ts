import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import {
  AssistantDataView,
  CannedIntent,
} from "./types";

// ──────────────────────────────────────────────────────────────────────
// Allowed tables + read-only enforcement
// ──────────────────────────────────────────────────────────────────────

const ALLOWED_TABLES = new Set([
  "products",
  "product_variants",
  "product_catalog",
  "product_images",
  "orders",
  "order_items",
  "customers",
  "customer_groups",
  "customer_addresses",
  "shippings",
  "shipping_events",
  "shipping_settings",
  "invoice_documents",
  "invoice_rows",
  "activity_logs",
]);

/**
 * Sanitize a generated SQL query to enforce:
 *  - Read-only (must start with SELECT or WITH ... SELECT)
 *  - No semicolons except trailing
 *  - No DDL/DML keywords
 *  - Only references whitelisted tables
 */
export function sanitizeSql(raw: string): string | null {
  if (!raw) return null;
  let sql = raw.trim().replace(/;\s*$/, "").trim();
  // Lowercase copy for keyword checks
  const lc = sql.toLowerCase();
  if (!/^(with\b[\s\S]+\bselect\b)|(select\b)/.test(lc)) {
    return null;
  }
  // Forbidden tokens
  const forbidden = [
    /\binsert\b/i,
    /\bupdate\b/i,
    /\bdelete\b/i,
    /\bdrop\b/i,
    /\btruncate\b/i,
    /\balter\b/i,
    /\bcreate\b/i,
    /\bgrant\b/i,
    /\brevoke\b/i,
    /\bcopy\b/i,
    /\bvacuum\b/i,
    /\breindex\b/i,
    /\brefresh\b/i,
    /\bmaterialized\b/i,
    /\bpg_read_file\b/i,
    /\bpg_write_file\b/i,
    /;/,
    /--/, // no comments
    /\/\*/, // no block comments
  ];
  for (const re of forbidden) {
    if (re.test(sql)) return null;
  }
  // Validate table names referenced
  const tableRefs = Array.from(sql.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)/gi)).map((m) =>
    m[1].toLowerCase()
  );
  for (const t of tableRefs) {
    if (!ALLOWED_TABLES.has(t)) return null;
  }
  // Enforce a LIMIT for safety
  if (!/\blimit\b/i.test(sql)) {
    sql += " limit 200";
  }
  return sql;
}

// ──────────────────────────────────────────────────────────────────────
// SQL runner (PG only — Supabase/JSON fallback returns empty)
// ──────────────────────────────────────────────────────────────────────

export async function runAssistantSql(sql: string): Promise<{ columns: string[]; rows: any[]; rowCount: number } | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const pool = getPool();
  const clean = sanitizeSql(sql);
  if (!clean) return null;
  try {
    const res = await pool.query(clean);
    const rows = res.rows ?? [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { columns, rows, rowCount: res.rowCount ?? rows.length };
  } catch (err) {
    console.warn("assistant SQL failed:", err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Canned intents — instant answers for the most common questions
// ──────────────────────────────────────────────────────────────────────

export async function runCannedIntent(intent: CannedIntent): Promise<AssistantDataView | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const pool = getPool();

  switch (intent) {
    case "today_revenue": {
      const r = await pool.query(
        `select coalesce(sum(total),0)::numeric as revenue,
                count(*)::int as orders
           from orders
          where created_at >= date_trunc('day', now())
            and status not in ('cancelled')`
      );
      const revenue = Number(r.rows[0]?.revenue ?? 0);
      const orders = r.rows[0]?.orders ?? 0;
      const prev = await pool.query(
        `select coalesce(sum(total),0)::numeric as revenue
           from orders
          where created_at >= date_trunc('day', now() - interval '1 day')
            and created_at <  date_trunc('day', now())
            and status not in ('cancelled')`
      );
      const prevRev = Number(prev.rows[0]?.revenue ?? 0);
      const trend = computeTrend(revenue, prevRev);
      return {
        columns: ["revenue", "orders"],
        rows: [{ revenue, orders }],
        visualization: "number",
        title: "Doanh thu hôm nay",
        metric_label: "VND",
        metric_value: revenue.toLocaleString("vi-VN"),
        trend,
      };
    }
    case "week_revenue": {
      const r = await pool.query(
        `select coalesce(sum(total),0)::numeric as revenue,
                count(*)::int as orders
           from orders
          where created_at >= date_trunc('week', now())
            and status not in ('cancelled')`
      );
      const revenue = Number(r.rows[0]?.revenue ?? 0);
      const orders = r.rows[0]?.orders ?? 0;
      const prev = await pool.query(
        `select coalesce(sum(total),0)::numeric as revenue
           from orders
          where created_at >= date_trunc('week', now() - interval '1 week')
            and created_at <  date_trunc('week', now())
            and status not in ('cancelled')`
      );
      const prevRev = Number(prev.rows[0]?.revenue ?? 0);
      return {
        columns: ["revenue", "orders"],
        rows: [{ revenue, orders }],
        visualization: "number",
        title: "Doanh thu tuần này",
        metric_label: "VND",
        metric_value: revenue.toLocaleString("vi-VN"),
        trend: computeTrend(revenue, prevRev),
      };
    }
    case "month_revenue": {
      const r = await pool.query(
        `select coalesce(sum(total),0)::numeric as revenue,
                count(*)::int as orders
           from orders
          where created_at >= date_trunc('month', now())
            and status not in ('cancelled')`
      );
      const revenue = Number(r.rows[0]?.revenue ?? 0);
      const orders = r.rows[0]?.orders ?? 0;
      const prev = await pool.query(
        `select coalesce(sum(total),0)::numeric as revenue
           from orders
          where created_at >= date_trunc('month', now() - interval '1 month')
            and created_at <  date_trunc('month', now())
            and status not in ('cancelled')`
      );
      const prevRev = Number(prev.rows[0]?.revenue ?? 0);
      return {
        columns: ["revenue", "orders"],
        rows: [{ revenue, orders }],
        visualization: "number",
        title: "Doanh thu tháng này",
        metric_label: "VND",
        metric_value: revenue.toLocaleString("vi-VN"),
        trend: computeTrend(revenue, prevRev),
      };
    }
    case "top_products": {
      const r = await pool.query(
        `select oi.product_name as name,
                sum(oi.quantity)::int as qty,
                sum(oi.line_total)::numeric as revenue
           from order_items oi
           join orders o on o.id = oi.order_id
          where o.created_at >= now() - interval '30 days'
            and o.status not in ('cancelled')
          group by oi.product_name
          order by revenue desc
          limit 10`
      );
      return {
        columns: ["name", "qty", "revenue"],
        rows: r.rows.map((row: any) => ({
          name: row.name,
          qty: Number(row.qty),
          revenue: Number(row.revenue),
        })),
        visualization: "bar",
        title: "Top 10 sản phẩm bán chạy 30 ngày",
      };
    }
    case "low_stock": {
      // products table has stock column; fall back to 0 if missing
      const r = await pool.query(
        `select name, sku, coalesce(stock, 0)::int as stock
           from products
          where coalesce(stock, 0) <= 10
          order by stock asc
          limit 20`
      );
      return {
        columns: ["name", "sku", "stock"],
        rows: r.rows,
        visualization: "table",
        title: "Sản phẩm sắp hết hàng",
      };
    }
    case "overdue_orders": {
      const r = await pool.query(
        `select code, customer_name, total, payment_status, created_at
           from orders
          where payment_status in ('unpaid', 'partial')
            and status not in ('cancelled')
          order by created_at asc
          limit 20`
      );
      return {
        columns: ["code", "customer_name", "total", "payment_status", "created_at"],
        rows: r.rows,
        visualization: "table",
        title: "Đơn hàng chưa thanh toán (lâu nhất trước)",
      };
    }
    case "pending_shippings": {
      const r = await pool.query(
        `select tracking_code, customer_name, status, packed_at
           from shippings
          where status in ('pending', 'packing', 'awaiting_pickup', 'shipping')
          order by packed_at desc nulls last
          limit 20`
      );
      return {
        columns: ["tracking_code", "customer_name", "status", "packed_at"],
        rows: r.rows,
        visualization: "table",
        title: "Vận đơn đang xử lý",
      };
    }
    case "total_customers": {
      const r = await pool.query(`select count(*)::int as c from customers`);
      return {
        columns: ["count"],
        rows: [{ count: r.rows[0]?.c ?? 0 }],
        visualization: "number",
        title: "Tổng số khách hàng",
        metric_label: "khách",
        metric_value: String(r.rows[0]?.c ?? 0),
      };
    }
    case "total_products": {
      const r = await pool.query(`select count(*)::int as c from products where status = 'active'`);
      return {
        columns: ["count"],
        rows: [{ count: r.rows[0]?.c ?? 0 }],
        visualization: "number",
        title: "Tổng số sản phẩm đang bán",
        metric_label: "sản phẩm",
        metric_value: String(r.rows[0]?.c ?? 0),
      };
    }
    case "best_customer": {
      const r = await pool.query(
        `select name, phone, total_spent::numeric as spent, total_orders
           from customers
          order by total_spent desc nulls last
          limit 5`
      );
      return {
        columns: ["name", "phone", "spent", "total_orders"],
        rows: r.rows.map((row: any) => ({
          name: row.name,
          phone: row.phone,
          spent: Number(row.spent ?? 0),
          total_orders: row.total_orders ?? 0,
        })),
        visualization: "table",
        title: "Top 5 khách hàng VIP",
      };
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function computeTrend(current: number, previous: number) {
  if (previous <= 0 && current <= 0) return undefined;
  if (previous <= 0) return { direction: "up" as const, percent: 100 };
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return { direction: "flat" as const, percent: 0 };
  return {
    direction: rounded > 0 ? ("up" as const) : ("down" as const),
    percent: Math.abs(rounded),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Intent classifier — pattern-match Vietnamese questions
// ──────────────────────────────────────────────────────────────────────

export function classifyIntent(question: string): CannedIntent | null {
  const q = question.toLowerCase().trim();
  if (!q) return null;
  if (/doanh thu.*(hôm nay|ngày hôm nay|hom nay)/.test(q)) return "today_revenue";
  if (/doanh thu.*(tuần|tuan)/.test(q)) return "week_revenue";
  if (/doanh thu.*(tháng|thang)/.test(q)) return "month_revenue";
  if (/(bán chạy|ban chạy|top sản phẩm|sản phẩm.*bán nhiều)/.test(q)) return "top_products";
  if (/(sắp hết|sap het|tồn kho thấp|ton kho thap|hết hàng)/.test(q)) return "low_stock";
  if (/(chưa thanh toán|chua thanh toán|nợ|công nợ|quá hạn)/.test(q)) return "overdue_orders";
  if (/(vận đơn.*(đang|chờ|cho)|đơn.*ship|đang giao)/.test(q)) return "pending_shippings";
  if (/(bao nhiêu.*khách|tổng.*khách|khách hàng)/.test(q)) return "total_customers";
  if (/(bao nhiêu.*sản phẩm|tổng.*sản phẩm)/.test(q)) return "total_products";
  if (/(khách vip|khách quen|top khách|mua nhiều nhất)/.test(q)) return "best_customer";
  return null;
}
