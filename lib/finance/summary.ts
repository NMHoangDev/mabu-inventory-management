import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type AgingBucket = "0_7" | "8_30" | "31_60" | "61_90" | "90_plus";

export interface AgingRow {
  bucket: AgingBucket;
  label: string;
  order_count: number;
  amount: number;
}

export interface CustomerDebt {
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  total_debt: number;
  order_count: number;
  oldest_order_date: string | null;
}

export interface FinanceSummary {
  /** Total money still owed by customers (unpaid + partial - paid) */
  total_receivable: number;
  /** Total money we owe suppliers (from recent scan invoices unpaid) */
  total_payable: number;
  /** Cash collected this month */
  cash_in_this_month: number;
  /** Net revenue this month (sum of order.total, not subtract paid) */
  revenue_this_month: number;
  /** Order count this month */
  orders_this_month: number;
  /** Order count outstanding payment */
  unpaid_order_count: number;
  /** Aging buckets */
  aging: AgingRow[];
  /** Top customers with debt */
  top_debtors: CustomerDebt[];
  /** Recent payments */
  recent_payments: Array<{
    order_id: string;
    order_code: string;
    customer_name: string;
    amount: number;
    paid: number;
    remaining: number;
    days_old: number;
  }>;
  /** Average days to collect payment */
  avg_days_to_pay: number;
  /** Cash flow projection for next 30 days (delivered COD coming) */
  incoming_cod_30d: number;
}

const BUCKETS: Array<{ key: AgingBucket; label: string; min: number; max: number }> = [
  { key: "0_7", label: "0-7 ngày", min: 0, max: 7 },
  { key: "8_30", label: "8-30 ngày", min: 8, max: 30 },
  { key: "31_60", label: "31-60 ngày", min: 31, max: 60 },
  { key: "61_90", label: "61-90 ngày", min: 61, max: 90 },
  { key: "90_plus", label: ">90 ngày", min: 91, max: 999999 },
];

// ──────────────────────────────────────────────────────────────────────
// Compute
// ──────────────────────────────────────────────────────────────────────

export async function computeFinanceSummary(): Promise<FinanceSummary> {
  const empty: FinanceSummary = {
    total_receivable: 0,
    total_payable: 0,
    cash_in_this_month: 0,
    revenue_this_month: 0,
    orders_this_month: 0,
    unpaid_order_count: 0,
    aging: BUCKETS.map((b) => ({ bucket: b.key, label: b.label, order_count: 0, amount: 0 })),
    top_debtors: [],
    recent_payments: [],
    avg_days_to_pay: 0,
    incoming_cod_30d: 0,
  };

  if (!isDatabaseConfigured) return empty;
  await ensureDatabase();
  const pool = getPool();
  try {
    // Compute outstanding = total - paid (only for non-cancelled)
    const receivablesRes = await pool.query(`
      select
        coalesce(sum(greatest(total - paid, 0)),0)::numeric as total_receivable,
        coalesce(sum(case when payment_status in ('unpaid','partial') then 1 else 0 end),0)::int as unpaid_count,
        coalesce(sum(paid) filter (where created_at >= date_trunc('month', now())),0)::numeric as cash_in,
        coalesce(sum(total) filter (where created_at >= date_trunc('month', now()) and status not in ('cancelled')),0)::numeric as revenue_month,
        count(*) filter (where created_at >= date_trunc('month', now()))::int as orders_month
      from orders
    `);

    // Payable = recent scan invoices that have supplier + total_after_tax
    // Use last 60 days of invoice rows aggregated by supplier
    const payablesRes = await pool.query(`
      with latest_doc as (
        select id from invoice_documents
         where uploaded_at >= now() - interval '60 days'
      )
      select coalesce(sum(
        coalesce(nullif(r.total_after_tax,'')::numeric, nullif(r.amount_before_tax,'')::numeric, 0)
      ),0)::numeric as total_payable
        from invoice_rows r
        join latest_doc ld on ld.id = r.document_id
    `);

    // Aging buckets
    const agingRes = await pool.query(`
      select
        case
          when now() - created_at <= interval '7 days' then '0_7'
          when now() - created_at <= interval '30 days' then '8_30'
          when now() - created_at <= interval '60 days' then '31_60'
          when now() - created_at <= interval '90 days' then '61_90'
          else '90_plus'
        end as bucket,
        count(*)::int as cnt,
        coalesce(sum(greatest(total - paid, 0)),0)::numeric as amount
      from orders
      where status not in ('cancelled')
        and payment_status in ('unpaid','partial')
      group by 1
    `);

    // Top debtors
    const debtorsRes = await pool.query(`
      select
        customer_id,
        coalesce(nullif(customer_name,'(Khách lẻ)'),'(Khách lẻ)') as customer_name,
        coalesce(nullif(customer_phone,''),'') as customer_phone,
        coalesce(sum(greatest(total - paid, 0)),0)::numeric as total_debt,
        count(*)::int as order_count,
        min(created_at) as oldest_order_date
      from orders
      where status not in ('cancelled')
        and payment_status in ('unpaid','partial')
      group by customer_id, customer_name, customer_phone
      order by total_debt desc
      limit 20
    `);

    // Recent payments (orders partially or fully paid)
    const recentPayRes = await pool.query(`
      select id, code, customer_name, total::numeric, paid::numeric,
             (total - paid)::numeric as remaining,
             extract(day from now() - created_at)::int as days_old
        from orders
       where status not in ('cancelled')
         and paid > 0
         and (total - paid) > 0
       order by updated_at desc
       limit 20
    `);

    // Avg days to pay
    const avgPayRes = await pool.query(`
      select coalesce(avg(extract(day from updated_at - created_at))::numeric, 0)::numeric as avg_days
        from orders
       where paid >= total and status not in ('cancelled')
         and updated_at > created_at
         and created_at >= now() - interval '90 days'
    `);

    // Incoming COD (shipped orders with COD not yet returned)
    const codRes = await pool.query(`
      select coalesce(sum(cod_amount),0)::numeric as incoming
        from shippings
       where status in ('shipping','delivered')
         and cod_amount > 0
    `);

    const r = receivablesRes.rows[0] ?? {};
    const agingMap = new Map<string, { order_count: number; amount: number }>();
    for (const row of agingRes.rows) {
      agingMap.set(row.bucket, { order_count: Number(row.cnt), amount: Number(row.amount) });
    }

    return {
      total_receivable: Number(r.total_receivable ?? 0),
      total_payable: Number(payablesRes.rows[0]?.total_payable ?? 0),
      cash_in_this_month: Number(r.cash_in ?? 0),
      revenue_this_month: Number(r.revenue_month ?? 0),
      orders_this_month: Number(r.orders_month ?? 0),
      unpaid_order_count: Number(r.unpaid_count ?? 0),
      aging: BUCKETS.map((b) => ({
        bucket: b.key,
        label: b.label,
        order_count: agingMap.get(b.key)?.order_count ?? 0,
        amount: agingMap.get(b.key)?.amount ?? 0,
      })),
      top_debtors: debtorsRes.rows.map((row: any) => ({
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        total_debt: Number(row.total_debt),
        order_count: Number(row.order_count),
        oldest_order_date: row.oldest_order_date,
      })),
      recent_payments: recentPayRes.rows.map((row: any) => ({
        order_id: row.id,
        order_code: row.code,
        customer_name: row.customer_name,
        amount: Number(row.total),
        paid: Number(row.paid),
        remaining: Number(row.remaining),
        days_old: Number(row.days_old),
      })),
      avg_days_to_pay: Math.round(Number(avgPayRes.rows[0]?.avg_days ?? 0)),
      incoming_cod_30d: Number(codRes.rows[0]?.incoming ?? 0),
    };
  } catch (err) {
    console.warn("computeFinanceSummary failed:", err);
    return empty;
  }
}
