import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { isDatabaseConfigured, getPool, logActivity } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { getSupabaseDataClient, isSupabaseDataConfigured, SHIPPING_TABLES } from "./supabase";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type ShippingStatus =
  | "pending"
  | "packing"
  | "awaiting_pickup"
  | "shipping"
  | "delivered"
  | "returning"
  | "cancelled"
  | "returned"
  | "failed";

export interface ShippingEvent {
  id: string;
  shipping_id: string;
  status: string;
  description: string;
  location: string;
  occurred_at: string;
  created_at: string;
}

export interface Shipping {
  id: string;
  tracking_code: string;
  order_id: string | null;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  province: string;
  district: string;
  ward: string;
  partner: string;
  partner_service: string;
  status: ShippingStatus;
  cod_amount: number;
  shipping_fee: number;
  weight: number;
  note: string;
  branch: string;
  staff: string;
  packed_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  events?: ShippingEvent[];
}

export interface ShippingInput {
  tracking_code?: string;
  order_id?: string | null;
  customer_name: string;
  customer_phone?: string;
  shipping_address?: string;
  province?: string;
  district?: string;
  ward?: string;
  partner?: string;
  partner_service?: string;
  status?: ShippingStatus;
  cod_amount?: number;
  shipping_fee?: number;
  weight?: number;
  note?: string;
  branch?: string;
  staff?: string;
  packed_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
}

export interface ShippingStats {
  packing: number;
  awaiting_pickup: number;
  shipping: number;
  delivered: number;
  re_delivery: number;
  cancel_pending: number;
  cancel_received: number;
  audit: {
    collecting: { orders: number; cod: number; fee: number };
    waiting_audit: { orders: number; cod: number; fee: number };
    audited: { orders: number; cod: number; fee: number };
  };
  delivery_success_rate: number; // 0..100
}

export interface ShippingListFilters {
  search?: string;
  status?: ShippingStatus | "all";
  partner?: string | "all";
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface ShippingListResult {
  orders: Shipping[];
  total: number;
  page: number;
  page_size: number;
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function rowToShipping(row: any, events: ShippingEvent[] = []): Shipping {
  return {
    id: row.id,
    tracking_code: row.tracking_code,
    order_id: row.order_id ?? null,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone ?? "",
    shipping_address: row.shipping_address ?? "",
    province: row.province ?? "",
    district: row.district ?? "",
    ward: row.ward ?? "",
    partner: row.partner ?? "",
    partner_service: row.partner_service ?? "",
    status: row.status,
    cod_amount: Number(row.cod_amount ?? 0),
    shipping_fee: Number(row.shipping_fee ?? 0),
    weight: Number(row.weight ?? 0),
    note: row.note ?? "",
    branch: row.branch ?? "",
    staff: row.staff ?? "",
    packed_at: row.packed_at ?? null,
    picked_up_at: row.picked_up_at ?? null,
    delivered_at: row.delivered_at ?? null,
    cancelled_at: row.cancelled_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    events,
  };
}

function rowToEvent(row: any): ShippingEvent {
  return {
    id: String(row.id),
    shipping_id: row.shipping_id,
    status: row.status,
    description: row.description ?? "",
    location: row.location ?? "",
    occurred_at: row.occurred_at,
    created_at: row.created_at,
  };
}

async function generateTrackingCode(): Promise<string> {
  // Luhn-style random 12-digit code; collision rare in JSON, PG has unique constraint
  let code = "";
  for (let i = 0; i < 12; i++) code += Math.floor(Math.random() * 10).toString();
  return `VC${code}`;
}

// ──────────────────────────────────────────────────────────────────────
// Backend: local PG first
// ──────────────────────────────────────────────────────────────────────

async function pgGetStats(): Promise<ShippingStats> {
  await ensureDatabase();
  const pool = getPool();
  const [statusRes, auditRes, successRes, totalRes] = await Promise.all([
    pool.query(`
      select status, count(*)::int as c
      from shippings
      where created_at >= now() - interval '30 days'
      group by status
    `),
    pool.query(`
      select
        sum(case when status in ('shipping','awaiting_pickup','packing') then 1 else 0 end)::int as collecting_orders,
        sum(case when status in ('shipping','awaiting_pickup','packing') then cod_amount else 0 end)::numeric as collecting_cod,
        sum(case when status in ('shipping','awaiting_pickup','packing') then shipping_fee else 0 end)::numeric as collecting_fee,
        sum(case when status in ('delivered') and delivered_at >= now() - interval '7 days' then 1 else 0 end)::int as waiting_orders,
        sum(case when status in ('delivered') and delivered_at >= now() - interval '7 days' then cod_amount else 0 end)::numeric as waiting_cod,
        sum(case when status in ('delivered') and delivered_at >= now() - interval '7 days' then shipping_fee else 0 end)::numeric as waiting_fee,
        sum(case when status in ('returned') then 1 else 0 end)::int as audited_orders,
        sum(case when status in ('returned') then cod_amount else 0 end)::numeric as audited_cod,
        sum(case when status in ('returned') then shipping_fee else 0 end)::numeric as audited_fee
      from shippings
    `),
    pool.query(`
      select
        sum(case when status = 'delivered' then 1 else 0 end)::int as delivered,
        sum(case when status in ('delivered','returned') then 1 else 0 end)::int as finished
      from shippings
      where created_at >= now() - interval '30 days'
    `),
    pool.query(`select count(*)::int as c from shippings where created_at >= now() - interval '30 days'`),
  ]);

  const statusMap = new Map(statusRes.rows.map((r) => [r.status, r.c]));
  const audit = auditRes.rows[0] ?? {};
  const success = successRes.rows[0] ?? { delivered: 0, finished: 0 };
  const successRate = success.finished > 0 ? Math.round((success.delivered / success.finished) * 100) : 0;

  return {
    packing: statusMap.get("packing") ?? 0,
    awaiting_pickup: statusMap.get("awaiting_pickup") ?? 0,
    shipping: statusMap.get("shipping") ?? 0,
    delivered: statusMap.get("delivered") ?? 0,
    re_delivery: 0,
    cancel_pending: statusMap.get("cancelled") ?? 0,
    cancel_received: statusMap.get("returned") ?? 0,
    audit: {
      collecting: {
        orders: Number(audit.collecting_orders ?? 0),
        cod: Number(audit.collecting_cod ?? 0),
        fee: Number(audit.collecting_fee ?? 0),
      },
      waiting_audit: {
        orders: Number(audit.waiting_orders ?? 0),
        cod: Number(audit.waiting_cod ?? 0),
        fee: Number(audit.waiting_fee ?? 0),
      },
      audited: {
        orders: Number(audit.audited_orders ?? 0),
        cod: Number(audit.audited_cod ?? 0),
        fee: Number(audit.audited_fee ?? 0),
      },
    },
    delivery_success_rate: successRate,
  };
}

async function pgListShippings(filters: ShippingListFilters): Promise<ShippingListResult> {
  await ensureDatabase();
  const pool = getPool();
  const where: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (filters.search) {
    where.push(`(tracking_code ilike $${i} or customer_name ilike $${i} or customer_phone ilike $${i})`);
    params.push(`%${filters.search}%`);
    i++;
  }
  if (filters.status && filters.status !== "all") {
    where.push(`status = $${i++}`);
    params.push(filters.status);
  }
  if (filters.partner && filters.partner !== "all") {
    where.push(`partner = $${i++}`);
    params.push(filters.partner);
  }
  if (filters.date_from) {
    where.push(`packed_at >= $${i++}`);
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    where.push(`packed_at <= $${i++}`);
    params.push(filters.date_to);
  }
  const whereSql = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.page_size ?? 20));
  const offset = (page - 1) * pageSize;

  const [countRes, dataRes] = await Promise.all([
    pool.query(`select count(*)::int as cnt from shippings ${whereSql}`, params),
    pool.query(
      `select * from shippings ${whereSql} order by packed_at desc nulls last, created_at desc limit ${pageSize} offset ${offset}`,
      params
    ),
  ]);

  return {
    orders: dataRes.rows.map((r) => rowToShipping(r)),
    total: countRes.rows[0]?.cnt ?? 0,
    page,
    page_size: pageSize,
  };
}

async function pgGetShipping(id: string): Promise<Shipping | null> {
  await ensureDatabase();
  const pool = getPool();
  const [orderRes, eventsRes] = await Promise.all([
    pool.query(`select * from shippings where id = $1`, [id]),
    pool.query(`select * from shipping_events where shipping_id = $1 order by occurred_at asc, id asc`, [id]),
  ]);
  if (orderRes.rows.length === 0) return null;
  return rowToShipping(orderRes.rows[0], eventsRes.rows.map(rowToEvent));
}

async function pgCreateShipping(input: ShippingInput, initialEvent?: { status: string; description: string; location: string }): Promise<Shipping> {
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const code = input.tracking_code || (await generateTrackingCode());
    const status = input.status ?? "pending";
    const now = new Date().toISOString();
    const packedAt = input.packed_at ?? now;
    const orderRes = await client.query(
      `insert into shippings (
        tracking_code, order_id, customer_name, customer_phone, shipping_address,
        province, district, ward, partner, partner_service, status,
        cod_amount, shipping_fee, weight, note, branch, staff,
        packed_at, picked_up_at, delivered_at, cancelled_at,
        created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now(),now())
      returning *`,
      [
        code,
        input.order_id ?? null,
        input.customer_name,
        input.customer_phone ?? "",
        input.shipping_address ?? "",
        input.province ?? "",
        input.district ?? "",
        input.ward ?? "",
        input.partner ?? "NINJA VAN",
        input.partner_service ?? "",
        status,
        input.cod_amount ?? 0,
        input.shipping_fee ?? 0,
        input.weight ?? 0,
        input.note ?? "",
        input.branch ?? "Chi nhánh chính",
        input.staff ?? "",
        packedAt,
        input.picked_up_at ?? null,
        input.delivered_at ?? null,
        input.cancelled_at ?? null,
      ]
    );
    const order = orderRes.rows[0];

    const events: ShippingEvent[] = [];
    const evt = initialEvent ?? { status, description: "Tạo vận đơn", location: "Hệ thống" };
    const evtRes = await client.query(
      `insert into shipping_events (shipping_id, status, description, location, occurred_at, created_at)
       values ($1,$2,$3,$4,$5,now()) returning *`,
      [order.id, evt.status, evt.description, evt.location, now]
    );
    events.push(rowToEvent(evtRes.rows[0]));

    await client.query("commit");
    await logActivity("shipping", `Tạo vận đơn ${code} - ${input.customer_name}`);
    return rowToShipping(order, events);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

async function pgUpdateShipping(id: string, input: Partial<ShippingInput>, event?: { status: string; description: string; location: string }): Promise<Shipping | null> {
  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query(`select * from shippings where id = $1`, [id]);
    if (existing.rows.length === 0) {
      await client.query("rollback");
      return null;
    }
    const cur = existing.rows[0];
    const next = {
      customer_name: input.customer_name ?? cur.customer_name,
      customer_phone: input.customer_phone ?? cur.customer_phone,
      shipping_address: input.shipping_address ?? cur.shipping_address,
      province: input.province ?? cur.province,
      district: input.district ?? cur.district,
      ward: input.ward ?? cur.ward,
      partner: input.partner ?? cur.partner,
      partner_service: input.partner_service ?? cur.partner_service,
      status: input.status ?? cur.status,
      cod_amount: input.cod_amount ?? Number(cur.cod_amount ?? 0),
      shipping_fee: input.shipping_fee ?? Number(cur.shipping_fee ?? 0),
      weight: input.weight ?? Number(cur.weight ?? 0),
      note: input.note ?? cur.note,
      branch: input.branch ?? cur.branch,
      staff: input.staff ?? cur.staff,
      packed_at: input.packed_at ?? cur.packed_at,
      picked_up_at: input.picked_up_at ?? cur.picked_up_at,
      delivered_at: input.delivered_at ?? cur.delivered_at,
      cancelled_at: input.cancelled_at ?? cur.cancelled_at,
    };
    await client.query(
      `update shippings set
        customer_name=$2, customer_phone=$3, shipping_address=$4,
        province=$5, district=$6, ward=$7, partner=$8, partner_service=$9,
        status=$10, cod_amount=$11, shipping_fee=$12, weight=$13, note=$14,
        branch=$15, staff=$16,
        packed_at=$17, picked_up_at=$18, delivered_at=$19, cancelled_at=$20,
        updated_at=now()
       where id=$1`,
      [
        id,
        next.customer_name, next.customer_phone, next.shipping_address,
        next.province, next.district, next.ward, next.partner, next.partner_service,
        next.status, next.cod_amount, next.shipping_fee, next.weight, next.note,
        next.branch, next.staff,
        next.packed_at, next.picked_up_at, next.delivered_at, next.cancelled_at,
      ]
    );

    if (event) {
      await client.query(
        `insert into shipping_events (shipping_id, status, description, location, occurred_at, created_at)
         values ($1,$2,$3,$4,now(),now())`,
        [id, event.status, event.description, event.location]
      );
    }

    await client.query("commit");
    await logActivity("shipping", `Cập nhật vận đơn ${cur.tracking_code} → ${next.status}`);
    return await pgGetShipping(id);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

async function pgDeleteShipping(id: string): Promise<boolean> {
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(`delete from shippings where id = $1`, [id]);
  if ((res.rowCount ?? 0) > 0) {
    await logActivity("shipping", `Xoá vận đơn ${id}`);
  }
  return (res.rowCount ?? 0) > 0;
}

async function pgAppendEvent(id: string, evt: { status: string; description: string; location: string }): Promise<void> {
  await ensureDatabase();
  const pool = getPool();
  await pool.query(
    `insert into shipping_events (shipping_id, status, description, location, occurred_at, created_at)
     values ($1,$2,$3,$4,now(),now())`,
    [id, evt.status, evt.description, evt.location]
  );
}

// ──────────────────────────────────────────────────────────────────────
// Supabase (REST) backend
// ──────────────────────────────────────────────────────────────────────

function s(row: any, events: ShippingEvent[] = []): Shipping {
  return rowToShipping(row, events);
}

function sEvent(row: any): ShippingEvent {
  return rowToEvent(row);
}

async function supabaseGetStats(): Promise<ShippingStats> {
  const client = getSupabaseDataClient();
  if (!client) return emptyStats();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await client
    .from(SHIPPING_TABLES.shippings)
    .select("status, cod_amount, shipping_fee, delivered_at, packed_at, created_at")
    .gte("created_at", since);

  const list = rows ?? [];
  const byStatus = (s: string) => list.filter((r: any) => r.status === s).length;
  const sum = (s: string, field: string) =>
    list.filter((r: any) => r.status === s).reduce((a: number, b: any) => a + Number(b[field] ?? 0), 0);

  const delivered = byStatus("delivered");
  const finished = delivered + byStatus("returned");
  const successRate = finished > 0 ? Math.round((delivered / finished) * 100) : 0;

  const collecting = ["shipping", "awaiting_pickup", "packing"];
  const waiting = list.filter(
    (r: any) => r.status === "delivered" && r.delivered_at && Date.parse(r.delivered_at) >= Date.now() - 7 * 24 * 60 * 60 * 1000
  );

  return {
    packing: byStatus("packing"),
    awaiting_pickup: byStatus("awaiting_pickup"),
    shipping: byStatus("shipping"),
    delivered,
    re_delivery: 0,
    cancel_pending: byStatus("cancelled"),
    cancel_received: byStatus("returned"),
    audit: {
      collecting: {
        orders: list.filter((r: any) => collecting.includes(r.status)).length,
        cod: list.filter((r: any) => collecting.includes(r.status)).reduce((a: number, b: any) => a + Number(b.cod_amount ?? 0), 0),
        fee: list.filter((r: any) => collecting.includes(r.status)).reduce((a: number, b: any) => a + Number(b.shipping_fee ?? 0), 0),
      },
      waiting_audit: {
        orders: waiting.length,
        cod: waiting.reduce((a: number, b: any) => a + Number(b.cod_amount ?? 0), 0),
        fee: waiting.reduce((a: number, b: any) => a + Number(b.shipping_fee ?? 0), 0),
      },
      audited: {
        orders: byStatus("returned"),
        cod: sum("returned", "cod_amount"),
        fee: sum("returned", "shipping_fee"),
      },
    },
    delivery_success_rate: successRate,
  };
}

async function supabaseListShippings(filters: ShippingListFilters): Promise<ShippingListResult> {
  const client = getSupabaseDataClient();
  if (!client) return { orders: [], total: 0, page: 1, page_size: filters.page_size ?? 20 };
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.page_size ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = client.from(SHIPPING_TABLES.shippings).select("*", { count: "exact" });
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.partner && filters.partner !== "all") q = q.eq("partner", filters.partner);
  if (filters.search) {
    const s = `%${filters.search}%`;
    q = q.or(`tracking_code.ilike.${s},customer_name.ilike.${s},customer_phone.ilike.${s}`);
  }
  if (filters.date_from) q = q.gte("packed_at", filters.date_from);
  if (filters.date_to) q = q.lte("packed_at", filters.date_to);

  const { data, count } = await q
    .order("packed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  return {
    orders: (data ?? []).map((r) => s(r)),
    total: count ?? 0,
    page,
    page_size: pageSize,
  };
}

async function supabaseGetShipping(id: string): Promise<Shipping | null> {
  const client = getSupabaseDataClient();
  if (!client) return null;
  const { data: order } = await client.from(SHIPPING_TABLES.shippings).select("*").eq("id", id).maybeSingle();
  const { data: events } = await client
    .from(SHIPPING_TABLES.events)
    .select("*")
    .eq("shipping_id", id)
    .order("occurred_at", { ascending: true })
    .order("id", { ascending: true });
  if (!order) return null;
  return s(order, (events ?? []).map(sEvent));
}

async function supabaseCreateShipping(input: ShippingInput, initialEvent?: { status: string; description: string; location: string }): Promise<Shipping> {
  const client = getSupabaseDataClient();
  if (!client) throw new Error("Supabase is not configured.");
  const now = new Date().toISOString();
  const code = input.tracking_code || (await generateTrackingCode());
  const status = input.status ?? "pending";
  const payload = {
    tracking_code: code,
    order_id: input.order_id ?? null,
    customer_name: input.customer_name,
    customer_phone: input.customer_phone ?? "",
    shipping_address: input.shipping_address ?? "",
    province: input.province ?? "",
    district: input.district ?? "",
    ward: input.ward ?? "",
    partner: input.partner ?? "NINJA VAN",
    partner_service: input.partner_service ?? "",
    status,
    cod_amount: input.cod_amount ?? 0,
    shipping_fee: input.shipping_fee ?? 0,
    weight: input.weight ?? 0,
    note: input.note ?? "",
    branch: input.branch ?? "Chi nhánh chính",
    staff: input.staff ?? "",
    packed_at: input.packed_at ?? now,
    picked_up_at: input.picked_up_at ?? null,
    delivered_at: input.delivered_at ?? null,
    cancelled_at: input.cancelled_at ?? null,
  };
  const { data, error } = await client
    .from(SHIPPING_TABLES.shippings)
    .insert(payload)
    .select()
    .single();
  if (error) throw error;

  const evt = initialEvent ?? { status, description: "Tạo vận đơn", location: "Hệ thống" };
  await client.from(SHIPPING_TABLES.events).insert({
    shipping_id: data.id,
    status: evt.status,
    description: evt.description,
    location: evt.location,
    occurred_at: now,
  });
  return supabaseGetShipping(data.id) as Promise<Shipping>;
}

async function supabaseUpdateShipping(id: string, input: Partial<ShippingInput>, event?: { status: string; description: string; location: string }): Promise<Shipping | null> {
  const client = getSupabaseDataClient();
  if (!client) return null;
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of [
    "customer_name", "customer_phone", "shipping_address", "province", "district", "ward",
    "partner", "partner_service", "status", "cod_amount", "shipping_fee", "weight",
    "note", "branch", "staff", "packed_at", "picked_up_at", "delivered_at", "cancelled_at"
  ] as const) {
    if (input[k] !== undefined) update[k] = input[k];
  }
  const { error } = await client.from(SHIPPING_TABLES.shippings).update(update).eq("id", id);
  if (error) throw error;
  if (event) {
    await client.from(SHIPPING_TABLES.events).insert({
      shipping_id: id,
      status: event.status,
      description: event.description,
      location: event.location,
      occurred_at: new Date().toISOString(),
    });
  }
  return supabaseGetShipping(id);
}

async function supabaseDeleteShipping(id: string): Promise<boolean> {
  const client = getSupabaseDataClient();
  if (!client) return false;
  const { error } = await client.from(SHIPPING_TABLES.shippings).delete().eq("id", id);
  return !error;
}

// ──────────────────────────────────────────────────────────────────────
// JSON offline fallback
// ──────────────────────────────────────────────────────────────────────

const dataDir = process.env.INVOICEFLOW_DATA_DIR ?? (process.env.VERCEL ? path.join(os.tmpdir(), "invoiceflow") : path.join(process.cwd(), "data"));
const shippingsFile = path.join(dataDir, "shippings-store.json");

interface OfflineStore {
  shippings: any[];
  events: any[];
}
async function readOffline(): Promise<OfflineStore> {
  try {
    const raw = await fs.readFile(shippingsFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return { shippings: [], events: [] };
  }
}
async function writeOffline(store: OfflineStore) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(shippingsFile, JSON.stringify(store, null, 2), "utf8");
}

function emptyStats(): ShippingStats {
  return {
    packing: 0,
    awaiting_pickup: 0,
    shipping: 0,
    delivered: 0,
    re_delivery: 0,
    cancel_pending: 0,
    cancel_received: 0,
    audit: {
      collecting: { orders: 0, cod: 0, fee: 0 },
      waiting_audit: { orders: 0, cod: 0, fee: 0 },
      audited: { orders: 0, cod: 0, fee: 0 },
    },
    delivery_success_rate: 0,
  };
}

async function jsonGetStats(): Promise<ShippingStats> {
  const { shippings } = await readOffline();
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = shippings.filter((r: any) => new Date(r.created_at).getTime() >= since);
  const byStatus = (s: string) => recent.filter((r: any) => r.status === s).length;
  const sumField = (s: string, field: string) =>
    recent.filter((r: any) => r.status === s).reduce((a: number, b: any) => a + Number(b[field] ?? 0), 0);
  const collecting = ["shipping", "awaiting_pickup", "packing"];
  const waiting = recent.filter(
    (r: any) => r.status === "delivered" && r.delivered_at && Date.parse(r.delivered_at) >= Date.now() - 7 * 24 * 60 * 60 * 1000
  );
  const delivered = byStatus("delivered");
  const finished = delivered + byStatus("returned");
  return {
    packing: byStatus("packing"),
    awaiting_pickup: byStatus("awaiting_pickup"),
    shipping: byStatus("shipping"),
    delivered,
    re_delivery: 0,
    cancel_pending: byStatus("cancelled"),
    cancel_received: byStatus("returned"),
    audit: {
      collecting: {
        orders: recent.filter((r: any) => collecting.includes(r.status)).length,
        cod: recent.filter((r: any) => collecting.includes(r.status)).reduce((a: number, b: any) => a + Number(b.cod_amount ?? 0), 0),
        fee: recent.filter((r: any) => collecting.includes(r.status)).reduce((a: number, b: any) => a + Number(b.shipping_fee ?? 0), 0),
      },
      waiting_audit: {
        orders: waiting.length,
        cod: waiting.reduce((a: number, b: any) => a + Number(b.cod_amount ?? 0), 0),
        fee: waiting.reduce((a: number, b: any) => a + Number(b.shipping_fee ?? 0), 0),
      },
      audited: {
        orders: byStatus("returned"),
        cod: sumField("returned", "cod_amount"),
        fee: sumField("returned", "shipping_fee"),
      },
    },
    delivery_success_rate: finished > 0 ? Math.round((delivered / finished) * 100) : 0,
  };
}

async function jsonListShippings(filters: ShippingListFilters): Promise<ShippingListResult> {
  const { shippings } = await readOffline();
  const search = filters.search?.toLowerCase() ?? "";
  const filtered = shippings.filter((r) => {
    if (filters.status && filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.partner && filters.partner !== "all" && r.partner !== filters.partner) return false;
    if (search && !`${r.tracking_code} ${r.customer_name} ${r.customer_phone}`.toLowerCase().includes(search)) return false;
    if (filters.date_from && r.packed_at && new Date(r.packed_at) < new Date(filters.date_from)) return false;
    if (filters.date_to && r.packed_at && new Date(r.packed_at) > new Date(filters.date_to)) return false;
    return true;
  });
  filtered.sort((a, b) => {
    const ta = a.packed_at ? new Date(a.packed_at).getTime() : new Date(a.created_at).getTime();
    const tb = b.packed_at ? new Date(b.packed_at).getTime() : new Date(b.created_at).getTime();
    return tb - ta;
  });
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.page_size ?? 20));
  return {
    orders: filtered.slice((page - 1) * pageSize, page * pageSize).map((r) => rowToShipping(r)),
    total: filtered.length,
    page,
    page_size: pageSize,
  };
}

async function jsonGetShipping(id: string): Promise<Shipping | null> {
  const { shippings, events } = await readOffline();
  const s = shippings.find((r) => r.id === id);
  if (!s) return null;
  const ev = events.filter((e) => e.shipping_id === id).sort((a, b) =>
    new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );
  return rowToShipping(s, ev.map(rowToEvent));
}

async function jsonCreateShipping(input: ShippingInput, initialEvent?: { status: string; description: string; location: string }): Promise<Shipping> {
  const store = await readOffline();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const code = input.tracking_code || (await generateTrackingCode());
  const status = input.status ?? "pending";
  const ship = {
    id,
    tracking_code: code,
    order_id: input.order_id ?? null,
    customer_name: input.customer_name,
    customer_phone: input.customer_phone ?? "",
    shipping_address: input.shipping_address ?? "",
    province: input.province ?? "",
    district: input.district ?? "",
    ward: input.ward ?? "",
    partner: input.partner ?? "NINJA VAN",
    partner_service: input.partner_service ?? "",
    status,
    cod_amount: input.cod_amount ?? 0,
    shipping_fee: input.shipping_fee ?? 0,
    weight: input.weight ?? 0,
    note: input.note ?? "",
    branch: input.branch ?? "Chi nhánh chính",
    staff: input.staff ?? "",
    packed_at: input.packed_at ?? now,
    picked_up_at: input.picked_up_at ?? null,
    delivered_at: input.delivered_at ?? null,
    cancelled_at: input.cancelled_at ?? null,
    created_at: now,
    updated_at: now,
  };
  store.shippings.push(ship);
  const evt = initialEvent ?? { status, description: "Tạo vận đơn", location: "Hệ thống" };
  store.events.push({
    id: String(Date.now()),
    shipping_id: id,
    status: evt.status,
    description: evt.description,
    location: evt.location,
    occurred_at: now,
    created_at: now,
  });
  await writeOffline(store);
  return rowToShipping(ship, store.events.filter((e) => e.shipping_id === id).map(rowToEvent));
}

async function jsonUpdateShipping(id: string, input: Partial<ShippingInput>, event?: { status: string; description: string; location: string }): Promise<Shipping | null> {
  const store = await readOffline();
  const idx = store.shippings.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  store.shippings[idx] = { ...store.shippings[idx], ...input, updated_at: new Date().toISOString() };
  if (event) {
    store.events.push({
      id: String(Date.now()),
      shipping_id: id,
      status: event.status,
      description: event.description,
      location: event.location,
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  }
  await writeOffline(store);
  return jsonGetShipping(id);
}

async function jsonDeleteShipping(id: string): Promise<boolean> {
  const store = await readOffline();
  const before = store.shippings.length;
  store.shippings = store.shippings.filter((r) => r.id !== id);
  store.events = store.events.filter((e) => e.shipping_id !== id);
  if (store.shippings.length === before) return false;
  await writeOffline(store);
  return true;
}

// ──────────────────────────────────────────────────────────────────────
// Public facade: pick backend
// ──────────────────────────────────────────────────────────────────────

export async function getShippingStats(): Promise<ShippingStats> {
  if (isSupabaseDataConfigured()) {
    try { return await supabaseGetStats(); } catch (e) { console.warn("supabaseGetStats failed:", e); }
  }
  if (isDatabaseConfigured) {
    try { return await pgGetStats(); } catch (e) { console.warn("pgGetStats failed:", e); }
  }
  return jsonGetStats();
}

export async function listShippings(filters: ShippingListFilters = {}): Promise<ShippingListResult> {
  if (isSupabaseDataConfigured()) {
    try { return await supabaseListShippings(filters); } catch (e) { console.warn("supabaseListShippings failed:", e); }
  }
  if (isDatabaseConfigured) {
    try { return await pgListShippings(filters); } catch (e) { console.warn("pgListShippings failed:", e); }
  }
  return jsonListShippings(filters);
}

export async function getShipping(id: string): Promise<Shipping | null> {
  if (isSupabaseDataConfigured()) {
    try { return await supabaseGetShipping(id); } catch (e) { console.warn("supabaseGetShipping failed:", e); }
  }
  if (isDatabaseConfigured) {
    try { return await pgGetShipping(id); } catch (e) { console.warn("pgGetShipping failed:", e); }
  }
  return jsonGetShipping(id);
}

export async function createShipping(input: ShippingInput, initialEvent?: { status: string; description: string; location: string }): Promise<Shipping> {
  if (isSupabaseDataConfigured()) {
    try { return await supabaseCreateShipping(input, initialEvent); } catch (e) { console.warn("supabaseCreateShipping failed:", e); }
  }
  if (isDatabaseConfigured) {
    try { return await pgCreateShipping(input, initialEvent); } catch (e) { console.warn("pgCreateShipping failed:", e); }
  }
  return jsonCreateShipping(input, initialEvent);
}

export async function updateShipping(id: string, input: Partial<ShippingInput>, event?: { status: string; description: string; location: string }): Promise<Shipping | null> {
  if (isSupabaseDataConfigured()) {
    try { return await supabaseUpdateShipping(id, input, event); } catch (e) { console.warn("supabaseUpdateShipping failed:", e); }
  }
  if (isDatabaseConfigured) {
    try { return await pgUpdateShipping(id, input, event); } catch (e) { console.warn("pgUpdateShipping failed:", e); }
  }
  return jsonUpdateShipping(id, input, event);
}

export async function deleteShipping(id: string): Promise<boolean> {
  if (isSupabaseDataConfigured()) {
    try { return await supabaseDeleteShipping(id); } catch (e) { console.warn("supabaseDeleteShipping failed:", e); }
  }
  if (isDatabaseConfigured) {
    try { return await pgDeleteShipping(id); } catch (e) { console.warn("pgDeleteShipping failed:", e); }
  }
  return jsonDeleteShipping(id);
}

export async function appendShippingEvent(id: string, event: { status: string; description: string; location: string }): Promise<void> {
  if (isDatabaseConfigured) {
    try { return await pgAppendEvent(id, event); } catch (e) { console.warn("pgAppendEvent failed:", e); }
  }
  if (isSupabaseDataConfigured()) {
    const client = getSupabaseDataClient();
    if (client) {
      const { error } = await client.from(SHIPPING_TABLES.events).insert({
        shipping_id: id, status: event.status, description: event.description, location: event.location, occurred_at: new Date().toISOString(),
      });
      if (!error) return;
    }
  }
  const store = await readOffline();
  store.events.push({
    id: String(Date.now()),
    shipping_id: id,
    status: event.status,
    description: event.description,
    location: event.location,
    occurred_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  await writeOffline(store);
}

export const SHIPPING_STATUS_LABEL: Record<ShippingStatus, string> = {
  pending: "Chờ đóng gói",
  packing: "Chờ đóng gói",
  awaiting_pickup: "Chờ shipper lấy hàng",
  shipping: "Đang giao hàng",
  delivered: "Đã giao hàng",
  returning: "Chờ giao lại",
  cancelled: "Hủy giao - chờ nhận",
  returned: "Hủy giao - đã nhận",
  failed: "Giao thất bại",
};

export const SHIPPING_STATUS_BADGE: Record<ShippingStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  packing: "bg-blue-100 text-blue-700",
  awaiting_pickup: "bg-blue-100 text-blue-700",
  shipping: "bg-orange-100 text-orange-700",
  delivered: "bg-green-100 text-green-700",
  returning: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-700",
  returned: "bg-slate-200 text-slate-600",
  failed: "bg-red-100 text-red-700",
};
