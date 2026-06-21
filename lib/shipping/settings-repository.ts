import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { isDatabaseConfigured, getPool } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { getSupabaseDataClient, isSupabaseDataConfigured } from "./supabase";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type WeightSource = "order" | "custom";
export type DimensionPreset = "default" | "large" | "extra_large";
export type RequirementPreset = "view_only" | "no_view" | "try_allowed";

export interface PickupAddress {
  id: string;
  label: string;
  address: string;
  is_default?: boolean;
}

export interface ShippingFeeRule {
  id: string;
  name: string;
  carrier: string;
  from_province: string;
  to_province: string;
  base_fee: number;
  per_kg_fee: number;
  free_shipping_threshold: number;
  enabled: boolean;
}

export interface ShippingSettings {
  id: number;
  // General
  weight_source: WeightSource;
  default_weight_g: number;
  default_dimension: DimensionPreset;
  default_requirement: RequirementPreset;
  default_note: string;
  // Delivery
  auto_sync_returned_status: boolean;
  auto_sync_cod: boolean;
  pickup_warning_days: number;
  delivery_warning_days: number;
  restricted_zones: string;
  pickup_addresses: PickupAddress[];
  updated_at: string;
}

export interface ShippingSettingsUpdate extends Partial<Omit<ShippingSettings, "id" | "updated_at">> {}

export const DIMENSION_LABELS: Record<DimensionPreset, string> = {
  default: "Mặc định - 10 x 10 x 10 cm",
  large: "Lớn - 30 x 30 x 30 cm",
  extra_large: "Siêu lớn - 50 x 50 x 50 cm",
};

export const REQUIREMENT_LABELS: Record<RequirementPreset, string> = {
  view_only: "Cho xem hàng, không cho thử",
  no_view: "Không cho xem hàng",
  try_allowed: "Cho thử hàng",
};

// ──────────────────────────────────────────────────────────────────────
// Default values
// ──────────────────────────────────────────────────────────────────────

const DEFAULTS: ShippingSettings = {
  id: 1,
  weight_source: "order",
  default_weight_g: 0,
  default_dimension: "default",
  default_requirement: "view_only",
  default_note: "",
  auto_sync_returned_status: false,
  auto_sync_cod: true,
  pickup_warning_days: 2,
  delivery_warning_days: 3,
  restricted_zones: "",
  pickup_addresses: [],
  updated_at: new Date(0).toISOString(),
};

function rowToSettings(row: any): ShippingSettings {
  return {
    id: Number(row.id ?? 1),
    weight_source: (row.weight_source ?? DEFAULTS.weight_source) as WeightSource,
    default_weight_g: Number(row.default_weight_g ?? 0),
    default_dimension: (row.default_dimension ?? DEFAULTS.default_dimension) as DimensionPreset,
    default_requirement: (row.default_requirement ?? DEFAULTS.default_requirement) as RequirementPreset,
    default_note: row.default_note ?? "",
    auto_sync_returned_status: Boolean(row.auto_sync_returned_status ?? false),
    auto_sync_cod: row.auto_sync_cod ?? true,
    pickup_warning_days: Number(row.pickup_warning_days ?? 2),
    delivery_warning_days: Number(row.delivery_warning_days ?? 3),
    restricted_zones: row.restricted_zones ?? "",
    pickup_addresses: Array.isArray(row.pickup_addresses) ? row.pickup_addresses : [],
    updated_at: row.updated_at ?? new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────────────────────────
// PG backend
// ──────────────────────────────────────────────────────────────────────

async function pgGetSettings(): Promise<ShippingSettings> {
  await ensureDatabase();
  const pool = getPool();
  await pool.query(
    `insert into shipping_settings (id) values (1) on conflict (id) do nothing`
  );
  const res = await pool.query(`select * from shipping_settings where id = 1`);
  if (res.rows.length === 0) return { ...DEFAULTS, updated_at: new Date().toISOString() };
  return rowToSettings(res.rows[0]);
}

async function pgUpdateSettings(update: ShippingSettingsUpdate): Promise<ShippingSettings> {
  await ensureDatabase();
  const pool = getPool();
  await pool.query(`insert into shipping_settings (id) values (1) on conflict (id) do nothing`);

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const key of [
    "weight_source",
    "default_weight_g",
    "default_dimension",
    "default_requirement",
    "default_note",
    "auto_sync_returned_status",
    "auto_sync_cod",
    "pickup_warning_days",
    "delivery_warning_days",
    "restricted_zones",
  ] as const) {
    if (update[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(update[key]);
    }
  }
  if (update.pickup_addresses !== undefined) {
    fields.push(`pickup_addresses = $${i++}::jsonb`);
    values.push(JSON.stringify(update.pickup_addresses));
  }
  fields.push(`updated_at = now()`);

  await pool.query(
    `update shipping_settings set ${fields.join(", ")} where id = 1`,
    values
  );
  return pgGetSettings();
}

// ──────────────────────────────────────────────────────────────────────
// Supabase backend
// ──────────────────────────────────────────────────────────────────────

async function supabaseGetSettings(): Promise<ShippingSettings> {
  const client = getSupabaseDataClient();
  if (!client) return { ...DEFAULTS, updated_at: new Date().toISOString() };

  // ensure row exists
  await client.from("shipping_settings").upsert({ id: 1 }).select();
  const { data, error } = await client.from("shipping_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) return { ...DEFAULTS, updated_at: new Date().toISOString() };
  return rowToSettings(data);
}

async function supabaseUpdateSettings(update: ShippingSettingsUpdate): Promise<ShippingSettings> {
  const client = getSupabaseDataClient();
  if (!client) throw new Error("Supabase is not configured.");
  const payload: Record<string, any> = { id: 1, updated_at: new Date().toISOString() };
  for (const key of [
    "weight_source",
    "default_weight_g",
    "default_dimension",
    "default_requirement",
    "default_note",
    "auto_sync_returned_status",
    "auto_sync_cod",
    "pickup_warning_days",
    "delivery_warning_days",
    "restricted_zones",
  ] as const) {
    if (update[key] !== undefined) payload[key] = update[key];
  }
  if (update.pickup_addresses !== undefined) payload.pickup_addresses = update.pickup_addresses;

  const { error } = await client.from("shipping_settings").upsert(payload);
  if (error) throw error;
  return supabaseGetSettings();
}

// ──────────────────────────────────────────────────────────────────────
// JSON offline backend
// ──────────────────────────────────────────────────────────────────────

const dataDir = process.env.INVOICEFLOW_DATA_DIR ?? (process.env.VERCEL ? path.join(os.tmpdir(), "invoiceflow") : path.join(process.cwd(), "data"));
const settingsFile = path.join(dataDir, "shipping-settings.json");

async function jsonGetSettings(): Promise<ShippingSettings> {
  try {
    const raw = await fs.readFile(settingsFile, "utf8");
    return rowToSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS, updated_at: new Date().toISOString() };
  }
}

async function jsonUpdateSettings(update: ShippingSettingsUpdate): Promise<ShippingSettings> {
  const current = await jsonGetSettings();
  const next: ShippingSettings = {
    ...current,
    ...update,
    updated_at: new Date().toISOString(),
  };
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(settingsFile, JSON.stringify(next, null, 2), "utf8");
  return next;
}

// ──────────────────────────────────────────────────────────────────────
// Public facade
// ──────────────────────────────────────────────────────────────────────

export async function getShippingSettings(): Promise<ShippingSettings> {
  if (isSupabaseDataConfigured()) {
    try { return await supabaseGetSettings(); } catch (e) { console.warn("supabaseGetSettings failed:", e); }
  }
  if (isDatabaseConfigured) {
    try { return await pgGetSettings(); } catch (e) { console.warn("pgGetSettings failed:", e); }
  }
  return jsonGetSettings();
}

export async function updateShippingSettings(update: ShippingSettingsUpdate): Promise<ShippingSettings> {
  if (isSupabaseDataConfigured()) {
    try { return await supabaseUpdateSettings(update); } catch (e) { console.warn("supabaseUpdateSettings failed:", e); }
  }
  if (isDatabaseConfigured) {
    try { return await pgUpdateSettings(update); } catch (e) { console.warn("pgUpdateSettings failed:", e); }
  }
  return jsonUpdateSettings(update);
}
