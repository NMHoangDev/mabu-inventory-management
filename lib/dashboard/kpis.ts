import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface KpiTrend {
  current: number;
  previous: number;
  direction: "up" | "down" | "flat";
  percent: number;
}

export interface DashboardKpis {
  revenue_today: KpiTrend;
  revenue_week: KpiTrend;
  revenue_month: KpiTrend;
  orders_today: number;
  orders_pending: number;
  orders_overdue: number;
  customers_total: number;
  customers_new_this_month: number;
  products_total: number;
  products_out_of_stock: number;
  products_low_stock: number;
  pending_reorder_value: number;
  pending_shippings: number;
  recent_orders: Array<{
    id: string;
    code: string;
    customer_name: string;
    total: number;
    status: string;
    created_at: string;
  }>;
  top_products: Array<{
    product_id: string;
    product_name: string;
    qty: number;
    revenue: number;
  }>;
  hourly_revenue: Array<{ hour: number; revenue: number }>;
  /** Actionable alerts the owner should look at */
  alerts: Array<{
    id: string;
    severity: "info" | "warning" | "critical";
    title: string;
    description: string;
    action_label?: string;
    action_path?: string;
  }>;
}

// ──────────────────────────────────────────────────────────────────────
// Compute
// ──────────────────────────────────────────────────────────────────────

export async function computeDashboardKpis(): Promise<DashboardKpis> {
  const empty: DashboardKpis = {
    revenue_today: trend(0, 0),
    revenue_week: trend(0, 0),
    revenue_month: trend(0, 0),
    orders_today: 0,
    orders_pending: 0,
    orders_overdue: 0,
    customers_total: 0,
    customers_new_this_month: 0,
    products_total: 0,
    products_out_of_stock: 0,
    products_low_stock: 0,
    pending_reorder_value: 0,
    pending_shippings: 0,
    recent_orders: [],
    top_products: [],
    hourly_revenue: [],
    alerts: [],
  };

  if (!isDatabaseConfigured) return empty;
  await ensureDatabase();
  const pool = getPool();
  try {
    // Revenue trends (current vs previous period)
    const [rToday, rTodayPrev, rWeek, rWeekPrev, rMonth, rMonthPrev] = await Promise.all([
      pool.query(`select coalesce(sum(total),0)::numeric as r from orders where created_at >= date_trunc('day',now()) and status not in ('cancelled')`),
      pool.query(`select coalesce(sum(total),0)::numeric as r from orders where created_at >= date_trunc('day', now() - interval '1 day') and created_at < date_trunc('day',now()) and status not in ('cancelled')`),
      pool.query(`select coalesce(sum(total),0)::numeric as r from orders where created_at >= date_trunc('week',now()) and status not in ('cancelled')`),
      pool.query(`select coalesce(sum(total),0)::numeric as r from orders where created_at >= date_trunc('week', now() - interval '1 week') and created_at < date_trunc('week',now()) and status not in ('cancelled')`),
      pool.query(`select coalesce(sum(total),0)::numeric as r from orders where created_at >= date_trunc('month',now()) and status not in ('cancelled')`),
      pool.query(`select coalesce(sum(total),0)::numeric as r from orders where created_at >= date_trunc('month', now() - interval '1 month') and created_at < date_trunc('month',now()) and status not in ('cancelled')`),
    ]);

    // Order status counts
    const [orderStatusRes, overdueRes] = await Promise.all([
      pool.query(`
        select
          count(*) filter (where created_at >= date_trunc('day', now()))::int as today,
          count(*) filter (where status in ('new','processing') and payment_status in ('unpaid','partial'))::int as pending
        from orders
      `),
      pool.query(`
        select count(*)::int as c from orders
         where status not in ('cancelled','completed')
           and created_at < now() - interval '7 days'
      `),
    ]);

    // Customer / product counts
    const [custRes, newCustRes, prodRes, outStockRes, lowStockRes, reorderValRes, pendingShipRes] = await Promise.all([
      pool.query(`select count(*)::int as c from customers`),
      pool.query(`select count(*)::int as c from customers where created_at >= date_trunc('month', now())`),
      pool.query(`select count(*)::int as c from products where status='active'`),
      pool.query(`select count(*)::int as c from products where status='active' and coalesce(stock,0) <= 0`),
      pool.query(`select count(*)::int as c from products where status='active' and coalesce(stock,0) > 0 and coalesce(stock,0) <= reorder_point`),
      pool.query(`select coalesce(sum(r.suggested_qty * coalesce(p.cost_price,0)),0)::numeric as v from reorder_suggestions r join products p on p.id=r.product_id where r.status='open'`),
      pool.query(`select count(*)::int as c from shippings where status in ('pending','packing','awaiting_pickup','shipping')`),
    ]);

    // Recent orders
    const recentRes = await pool.query(`
      select id, code, customer_name, total::numeric, status, created_at
        from orders
       order by created_at desc
       limit 10
    `);

    // Top products (30d)
    const topRes = await pool.query(`
      select oi.product_id, oi.product_name,
             sum(oi.quantity)::int as qty,
             sum(oi.line_total)::numeric as revenue
        from order_items oi
        join orders o on o.id = oi.order_id
       where o.created_at >= now() - interval '30 days'
         and o.status not in ('cancelled')
       group by oi.product_id, oi.product_name
       order by revenue desc
       limit 5
    `);

    // Hourly revenue (today, by hour)
    const hourlyRes = await pool.query(`
      select extract(hour from created_at)::int as hour,
             sum(total)::numeric as revenue
        from orders
       where created_at >= date_trunc('day', now())
         and status not in ('cancelled')
       group by 1
       order by 1
    `);

    const result: DashboardKpis = {
      revenue_today: trend(Number(rToday.rows[0]?.r ?? 0), Number(rTodayPrev.rows[0]?.r ?? 0)),
      revenue_week: trend(Number(rWeek.rows[0]?.r ?? 0), Number(rWeekPrev.rows[0]?.r ?? 0)),
      revenue_month: trend(Number(rMonth.rows[0]?.r ?? 0), Number(rMonthPrev.rows[0]?.r ?? 0)),
      orders_today: orderStatusRes.rows[0]?.today ?? 0,
      orders_pending: orderStatusRes.rows[0]?.pending ?? 0,
      orders_overdue: overdueRes.rows[0]?.c ?? 0,
      customers_total: custRes.rows[0]?.c ?? 0,
      customers_new_this_month: newCustRes.rows[0]?.c ?? 0,
      products_total: prodRes.rows[0]?.c ?? 0,
      products_out_of_stock: outStockRes.rows[0]?.c ?? 0,
      products_low_stock: lowStockRes.rows[0]?.c ?? 0,
      pending_reorder_value: Number(reorderValRes.rows[0]?.v ?? 0),
      pending_shippings: pendingShipRes.rows[0]?.c ?? 0,
      recent_orders: recentRes.rows.map((r: any) => ({
        id: r.id,
        code: r.code,
        customer_name: r.customer_name,
        total: Number(r.total),
        status: r.status,
        created_at: r.created_at,
      })),
      top_products: topRes.rows.map((r: any) => ({
        product_id: r.product_id,
        product_name: r.product_name,
        qty: Number(r.qty),
        revenue: Number(r.revenue),
      })),
      hourly_revenue: hourlyRes.rows.map((r: any) => ({
        hour: r.hour,
        revenue: Number(r.revenue),
      })),
      alerts: [],
    };

    // ── Alerts
    if (result.products_out_of_stock > 0) {
      result.alerts.push({
        id: "out_of_stock",
        severity: "critical",
        title: `${result.products_out_of_stock} sản phẩm đã hết hàng`,
        description: "Các sản phẩm không còn tồn kho. Bạn nên nhập thêm để không mất đơn.",
        action_label: "Xem gợi ý nhập hàng",
        action_path: "/inventory",
      });
    }
    if (result.products_low_stock > 0) {
      result.alerts.push({
        id: "low_stock",
        severity: "warning",
        title: `${result.products_low_stock} sản phẩm sắp hết`,
        description: "Đã chạm ngưỡng cảnh báo tồn kho tối thiểu.",
        action_label: "Xem chi tiết",
        action_path: "/inventory",
      });
    }
    if (result.orders_overdue > 0) {
      result.alerts.push({
        id: "overdue_orders",
        severity: "warning",
        title: `${result.orders_overdue} đơn hàng chưa xử lý > 7 ngày`,
        description: "Một số đơn đang chờ xử lý quá lâu, có thể ảnh hưởng trải nghiệm khách.",
        action_label: "Mở danh sách đơn",
        action_path: "/orders",
      });
    }
    if (result.pending_shippings > 0) {
      result.alerts.push({
        id: "pending_ship",
        severity: "info",
        title: `${result.pending_shippings} vận đơn đang chờ`,
        description: "Có vận đơn cần được theo dõi để đảm bảo giao đúng hẹn.",
        action_label: "Mở vận chuyển",
        action_path: "/shipping/orders",
      });
    }
    return result;
  } catch (err) {
    console.warn("computeDashboardKpis failed:", err);
    return empty;
  }
}

function trend(current: number, previous: number): KpiTrend {
  if (previous <= 0 && current <= 0) return { current, previous, direction: "flat", percent: 0 };
  if (previous <= 0) return { current, previous, direction: "up", percent: 100 };
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return { current, previous, direction: "flat", percent: 0 };
  return {
    current,
    previous,
    direction: rounded > 0 ? "up" : "down",
    percent: Math.abs(rounded),
  };
}
