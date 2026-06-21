import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type Urgency = "low" | "medium" | "high" | "critical";
export type SuggestionStatus = "open" | "dismissed" | "ordered" | "received";

export interface ReorderSuggestion {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  urgency: Urgency;
  current_stock: number;
  reorder_point: number;
  suggested_qty: number;
  avg_daily_sales: number;
  days_until_zero: number;
  preferred_supplier: string;
  note: string;
  status: SuggestionStatus;
  generated_at: string;
  resolved_at: string | null;
}

export interface InventoryInsight {
  total_products: number;
  total_stock_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
  pending_receipts: number;
  pending_reorder_value: number;
  top_suggestions: ReorderSuggestion[];
  /** Top 10 products by stock value */
  high_value_stock: { id: string; name: string; sku: string; stock: number; cost_price: number; value: number }[];
  /** Products with no sale in 90 days (dead stock) */
  dead_stock: { id: string; name: string; sku: string; stock: number; cost_price: number; last_sale: string | null }[];
}

// ──────────────────────────────────────────────────────────────────────
// Compute insights (PG only — Supabase/JSON fallback returns zeros)
// ──────────────────────────────────────────────────────────────────────

export async function computeInventoryInsights(): Promise<InventoryInsight> {
  const empty: InventoryInsight = {
    total_products: 0,
    total_stock_value: 0,
    low_stock_count: 0,
    out_of_stock_count: 0,
    pending_receipts: 0,
    pending_reorder_value: 0,
    top_suggestions: [],
    high_value_stock: [],
    dead_stock: [],
  };
  if (!isDatabaseConfigured) return empty;
  await ensureDatabase();
  const pool = getPool();

  try {
    // 1) Compute sales velocity (last 30 days) per product and refresh reorder points
    await pool.query(`
      with velocity as (
        select oi.product_id,
               sum(oi.quantity)::numeric / 30.0 as avg_daily
          from order_items oi
          join orders o on o.id = oi.order_id
         where o.created_at >= now() - interval '30 days'
           and o.status not in ('cancelled')
           and oi.product_id is not null
         group by oi.product_id
      )
      update products p
         set avg_daily_sales = coalesce(v.avg_daily, 0),
             reorder_point   = case
               when coalesce(v.avg_daily, 0) > 0
                 then greatest(ceil(v.avg_daily * 7), 5)::numeric  -- 1 week cover, min 5
               else 5
             end,
             reorder_quantity = case
               when coalesce(v.avg_daily, 0) > 0
                 then greatest(ceil(v.avg_daily * 30), 10)::numeric -- 1 month cover, min 10
               else 10
             end
        from velocity v
       where v.product_id = p.id
    `);

    // 2) Upsert reorder suggestions
    await pool.query(`
      insert into reorder_suggestions
        (product_id, urgency, current_stock, reorder_point, suggested_qty,
         avg_daily_sales, days_until_zero, preferred_supplier, status, generated_at)
      select p.id,
             case
               when coalesce(p.stock,0) <= 0 then 'critical'
               when coalesce(p.stock,0) <= p.reorder_point * 0.5 then 'high'
               when coalesce(p.stock,0) <= p.reorder_point then 'medium'
               else 'low'
             end as urgency,
             coalesce(p.stock,0),
             p.reorder_point,
             p.reorder_quantity,
             p.avg_daily_sales,
             case when p.avg_daily_sales > 0
                  then floor(coalesce(p.stock,0) / p.avg_daily_sales)::int
                  else 9999
             end,
             coalesce(p.preferred_supplier, ''),
             'open',
             now()
        from products p
       where coalesce(p.stock,0) <= p.reorder_point
         and p.status = 'active'
      on conflict (product_id, status) do update
        set urgency = excluded.urgency,
            current_stock = excluded.current_stock,
            reorder_point = excluded.reorder_point,
            suggested_qty = excluded.suggested_qty,
            avg_daily_sales = excluded.avg_daily_sales,
            days_until_zero = excluded.days_until_zero,
            generated_at = excluded.generated_at
      where reorder_suggestions.status = 'open'
    `);

    // 3) Aggregate
    const [summaryRes, topRes, deadRes] = await Promise.all([
      pool.query(`
        select
          (select count(*) from products where status='active')::int as total_products,
          (select coalesce(sum(stock * coalesce(cost_price,0)),0)::numeric from products where status='active') as total_stock_value,
          (select count(*) from products where status='active' and coalesce(stock,0) > 0 and coalesce(stock,0) <= reorder_point)::int as low_stock_count,
          (select count(*) from products where status='active' and coalesce(stock,0) <= 0)::int as out_of_stock_count,
          (select count(*) from stock_receipts where received_at >= date_trunc('month', now()))::int as pending_receipts,
          (select coalesce(sum(suggested_qty * coalesce(p.cost_price,0)),0)::numeric
             from reorder_suggestions r
             join products p on p.id = r.product_id
            where r.status='open') as pending_reorder_value
      `),
      pool.query(`
        select p.id, p.name, coalesce(p.sku,'') as sku, coalesce(p.stock,0)::numeric as stock,
               coalesce(p.cost_price,0)::numeric as cost_price,
               (coalesce(p.stock,0) * coalesce(p.cost_price,0))::numeric as value
          from products p
         where p.status='active' and coalesce(p.stock,0) > 0
         order by value desc
         limit 10
      `),
      pool.query(`
        select p.id, p.name, coalesce(p.sku,'') as sku, coalesce(p.stock,0)::numeric as stock,
               coalesce(p.cost_price,0)::numeric as cost_price,
               (select max(o.created_at) from order_items oi join orders o on o.id=oi.order_id
                 where oi.product_id = p.id and o.status not in ('cancelled')) as last_sale
          from products p
         where p.status='active'
           and coalesce(p.stock,0) > 0
           and not exists (
             select 1 from order_items oi
               join orders o on o.id=oi.order_id
              where oi.product_id = p.id
                and o.created_at >= now() - interval '90 days'
                and o.status not in ('cancelled')
           )
         order by (coalesce(p.stock,0) * coalesce(p.cost_price,0)) desc
         limit 10
      `),
    ]);

    const sum = summaryRes.rows[0] ?? {};
    const top = await pool.query(`
      select r.id, r.product_id, p.name as product_name, coalesce(p.sku,'') as sku,
             r.urgency, r.current_stock::numeric, r.reorder_point::numeric,
             r.suggested_qty::numeric, r.avg_daily_sales::numeric,
             r.days_until_zero, coalesce(r.preferred_supplier,'') as preferred_supplier,
             coalesce(r.note,'') as note, r.status,
             r.generated_at, r.resolved_at
        from reorder_suggestions r
        join products p on p.id = r.product_id
       where r.status = 'open'
       order by case r.urgency
                  when 'critical' then 1
                  when 'high' then 2
                  when 'medium' then 3
                  else 4
                end,
                r.days_until_zero asc
       limit 10
    `);

    return {
      total_products: Number(sum.total_products ?? 0),
      total_stock_value: Number(sum.total_stock_value ?? 0),
      low_stock_count: Number(sum.low_stock_count ?? 0),
      out_of_stock_count: Number(sum.out_of_stock_count ?? 0),
      pending_receipts: Number(sum.pending_receipts ?? 0),
      pending_reorder_value: Number(sum.pending_reorder_value ?? 0),
      top_suggestions: top.rows.map(rowToSuggestion),
      high_value_stock: topRes.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        sku: r.sku,
        stock: Number(r.stock),
        cost_price: Number(r.cost_price),
        value: Number(r.value),
      })),
      dead_stock: deadRes.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        sku: r.sku,
        stock: Number(r.stock),
        cost_price: Number(r.cost_price),
        last_sale: r.last_sale,
      })),
    };
  } catch (err) {
    console.warn("computeInventoryInsights failed:", err);
    return empty;
  }
}

function rowToSuggestion(row: any): ReorderSuggestion {
  return {
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name,
    sku: row.sku,
    urgency: row.urgency,
    current_stock: Number(row.current_stock),
    reorder_point: Number(row.reorder_point),
    suggested_qty: Number(row.suggested_qty),
    avg_daily_sales: Number(row.avg_daily_sales),
    days_until_zero: Number(row.days_until_zero),
    preferred_supplier: row.preferred_supplier ?? "",
    note: row.note ?? "",
    status: row.status,
    generated_at: row.generated_at,
    resolved_at: row.resolved_at,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────────────

export async function markSuggestionStatus(id: string, status: SuggestionStatus) {
  if (!isDatabaseConfigured) return false;
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(
    `update reorder_suggestions set status=$2, resolved_at=case when $2<>'open' then now() else null end where id=$1`,
    [id, status]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function markSuggestionsBulk(ids: string[], status: SuggestionStatus) {
  if (!isDatabaseConfigured || ids.length === 0) return 0;
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(
    `update reorder_suggestions set status=$2, resolved_at=case when $2<>'open' then now() else null end where id = any($1::uuid[])`,
    [ids, status]
  );
  return res.rowCount ?? 0;
}
