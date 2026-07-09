/**
 * lib/storefront/settings.ts — cấu hình nội dung trang chủ storefront, 1 dòng
 * duy nhất (mirror shipping_settings). Đọc công khai (storefront), ghi
 * admin-only (Task P4, app/(dashboard)/settings/storefront).
 */

import { getPool, isDatabaseConfigured } from "../db/connection";
import { ensureDatabase } from "../db/migration";

export interface SiteSettings {
  store_name: string;
  banner_url: string;
  hero_title: string;
  hero_subtitle: string;
  announcement: string;
  contact_phone: string;
  contact_address: string;
  featured_category_ids: string[];
  featured_product_ids: string[];
}

const DEFAULTS: SiteSettings = {
  store_name: "Cửa hàng",
  banner_url: "",
  hero_title: "Mua sắm tiện lợi, giao hàng nhanh chóng",
  hero_subtitle: "Khám phá sản phẩm chất lượng với giá tốt nhất",
  announcement: "",
  contact_phone: "",
  contact_address: "",
  featured_category_ids: [],
  featured_product_ids: [],
};

function rowToSettings(row: any): SiteSettings {
  return {
    store_name: row.store_name ?? DEFAULTS.store_name,
    banner_url: row.banner_url ?? "",
    hero_title: row.hero_title ?? "",
    hero_subtitle: row.hero_subtitle ?? "",
    announcement: row.announcement ?? "",
    contact_phone: row.contact_phone ?? "",
    contact_address: row.contact_address ?? "",
    featured_category_ids: Array.isArray(row.featured_category_ids) ? row.featured_category_ids : [],
    featured_product_ids: Array.isArray(row.featured_product_ids) ? row.featured_product_ids : [],
  };
}

export async function getSiteSettings(): Promise<SiteSettings> {
  if (!isDatabaseConfigured) return DEFAULTS;
  await ensureDatabase();
  const pool = getPool();
  await pool.query(`insert into site_settings (id) values (1) on conflict (id) do nothing`);
  const res = await pool.query(`select * from site_settings where id = 1`);
  if (res.rows.length === 0) return DEFAULTS;
  return rowToSettings(res.rows[0]);
}

export async function updateSiteSettings(update: Partial<SiteSettings>): Promise<SiteSettings> {
  await ensureDatabase();
  const pool = getPool();
  await pool.query(`insert into site_settings (id) values (1) on conflict (id) do nothing`);

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const key of [
    "store_name",
    "banner_url",
    "hero_title",
    "hero_subtitle",
    "announcement",
    "contact_phone",
    "contact_address",
  ] as const) {
    if (update[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(update[key]);
    }
  }
  if (update.featured_category_ids !== undefined) {
    fields.push(`featured_category_ids = $${i++}`);
    values.push(update.featured_category_ids);
  }
  if (update.featured_product_ids !== undefined) {
    fields.push(`featured_product_ids = $${i++}`);
    values.push(update.featured_product_ids);
  }
  fields.push(`updated_at = now()`);

  await pool.query(`update site_settings set ${fields.join(", ")} where id = 1`, values);
  return getSiteSettings();
}
