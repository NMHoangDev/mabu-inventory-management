import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db/migration";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Báo cáo lãi lỗ — trước đây tính hoàn toàn phía client với số liệu bịa:
// giá vốn = 45%*doanh thu cố định, chi phí = 25%*doanh thu cố định, top sản
// phẩm là danh sách viết cứng, biểu đồ theo ngày chia đều rồi rung random.
// Giờ tính thật:
//   - Giá vốn: sum(order_items.quantity * products.cost_price) — dùng giá
//     vốn HIỆN TẠI của sản phẩm (không có bảng lưu giá vốn tại thời điểm bán,
//     đây là xấp xỉ hợp lý, chuẩn hơn hẳn tỷ lệ cố định).
//   - Chi phí: sum(cash_book) các phiếu CHI (voucher_type='payment') KHÔNG
//     phải trả nhà cung cấp (payment_type <> 'supplier_payment') — tiền trả
//     NCC đã nằm trong giá vốn qua goods_receipts, tính thêm vào đây sẽ trùng.
//   - Top sản phẩm + biểu đồ theo ngày: group by thật từ order_items/orders.
export async function GET(request: Request) {
  const guard = await requirePermission("reports.view_finance");
  if (guard) return guard;
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("date_from") || url.searchParams.get("from") || "";
    const to = url.searchParams.get("date_to") || url.searchParams.get("to") || "";

    if (!isDatabaseConfigured || !from || !to) {
      return NextResponse.json({
        revenue: 0, cogs: 0, gross_profit: 0, gross_margin: 0,
        expenses: 0, net_profit: 0, net_margin: 0,
        order_count: 0, avg_order_value: 0,
        daily_data: [], by_payment_method: [], top_products: []
      });
    }
    await ensureDatabase();
    const pool = getPool();
    const range = [from, to];

    const summaryRes = await pool.query(
      `select count(*)::int as order_count, coalesce(sum(total), 0)::numeric as revenue
         from orders
        where status <> 'cancelled'
          and created_at >= $1::date and created_at < ($2::date + interval '1 day')`,
      range
    );
    const revenue = Number(summaryRes.rows[0]?.revenue ?? 0);
    const order_count = Number(summaryRes.rows[0]?.order_count ?? 0);

    const cogsRes = await pool.query(
      `select coalesce(sum(oi.quantity * coalesce(p.cost_price, 0)), 0)::numeric as cogs
         from order_items oi
         join orders o on o.id = oi.order_id
         left join products p on p.id = oi.product_id
        where o.status <> 'cancelled'
          and o.created_at >= $1::date and o.created_at < ($2::date + interval '1 day')`,
      range
    );
    const cogs = Number(cogsRes.rows[0]?.cogs ?? 0);

    const expensesRes = await pool.query(
      `select coalesce(sum(amount), 0)::numeric as expenses
         from cash_book
        where voucher_type = 'payment'
          and coalesce(payment_type, '') <> 'supplier_payment'
          and status = 'completed'
          and recorded_date >= $1::date and recorded_date < ($2::date + interval '1 day')`,
      range
    );
    const expenses = Number(expensesRes.rows[0]?.expenses ?? 0);

    const byMethodRes = await pool.query(
      `select payment_status as method, count(*)::int as count, coalesce(sum(total), 0)::numeric as amount
         from orders
        where status <> 'cancelled'
          and created_at >= $1::date and created_at < ($2::date + interval '1 day')
        group by payment_status`,
      range
    );

    const dailyRes = await pool.query(
      `select
         to_char(o.created_at, 'YYYY-MM-DD') as date,
         coalesce(sum(o.total), 0)::numeric as revenue
       from orders o
       where o.status <> 'cancelled'
         and o.created_at >= $1::date and o.created_at < ($2::date + interval '1 day')
       group by 1
       order by 1 asc`,
      range
    );
    const dailyCogsRes = await pool.query(
      `select
         to_char(o.created_at, 'YYYY-MM-DD') as date,
         coalesce(sum(oi.quantity * coalesce(p.cost_price, 0)), 0)::numeric as cogs
       from order_items oi
       join orders o on o.id = oi.order_id
       left join products p on p.id = oi.product_id
       where o.status <> 'cancelled'
         and o.created_at >= $1::date and o.created_at < ($2::date + interval '1 day')
       group by 1`,
      range
    );
    const dailyExpensesRes = await pool.query(
      `select
         to_char(recorded_date, 'YYYY-MM-DD') as date,
         coalesce(sum(amount), 0)::numeric as expenses
       from cash_book
       where voucher_type = 'payment'
         and coalesce(payment_type, '') <> 'supplier_payment'
         and status = 'completed'
         and recorded_date >= $1::date and recorded_date < ($2::date + interval '1 day')
       group by 1`,
      range
    );
    const cogsByDate = new Map(dailyCogsRes.rows.map((r) => [r.date, Number(r.cogs)]));
    const expByDate = new Map(dailyExpensesRes.rows.map((r) => [r.date, Number(r.expenses)]));

    // Fill mọi ngày trong range (kể cả ngày không có đơn) để trục thời gian liên tục.
    const daily_data: { date: string; revenue: number; cogs: number; expenses: number }[] = [];
    const revByDate = new Map(dailyRes.rows.map((r) => [r.date, Number(r.revenue)]));
    const d0 = new Date(from);
    const d1 = new Date(to);
    for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
      const key = new Date(d).toISOString().slice(0, 10);
      daily_data.push({
        date: key,
        revenue: revByDate.get(key) ?? 0,
        cogs: cogsByDate.get(key) ?? 0,
        expenses: expByDate.get(key) ?? 0
      });
    }

    const topProductsRes = await pool.query(
      `select oi.product_name, sum(oi.quantity)::numeric as quantity_sold, sum(oi.line_total)::numeric as revenue
         from order_items oi
         join orders o on o.id = oi.order_id
        where o.status <> 'cancelled'
          and o.created_at >= $1::date and o.created_at < ($2::date + interval '1 day')
        group by oi.product_name
        order by revenue desc
        limit 10`,
      range
    );

    const gross_profit = revenue - cogs;
    const gross_margin = revenue > 0 ? (gross_profit / revenue) * 100 : 0;
    const net_profit = gross_profit - expenses;
    const net_margin = revenue > 0 ? (net_profit / revenue) * 100 : 0;
    const avg_order_value = order_count > 0 ? Math.round(revenue / order_count) : 0;

    return NextResponse.json({
      revenue, cogs, gross_profit, gross_margin,
      expenses, net_profit, net_margin,
      order_count, avg_order_value,
      daily_data,
      by_payment_method: byMethodRes.rows.map((r) => ({
        method: r.method,
        amount: Number(r.amount),
        count: Number(r.count)
      })),
      top_products: topProductsRes.rows.map((r) => ({
        product_name: r.product_name,
        quantity_sold: Number(r.quantity_sold),
        revenue: Number(r.revenue)
      }))
    });
  } catch (error) {
    console.error("GET /api/reports/profit-loss failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được báo cáo lãi lỗ." },
      { status: 500 }
    );
  }
}
