/**
 * lib/storefront/catalog.ts — đọc sản phẩm/danh mục công khai cho website bán
 * hàng. CHỈ trả field an toàn để hiển thị công khai — không bao giờ select
 * cost_price/preferred_supplier/reorder_point... (dữ liệu nội bộ). Sản phẩm
 * phải "hiển thị trên website" (status='active' và published_at khác null,
 * xem STOREFRONT_PLAN.md mục 6.1) mới xuất hiện ở đây.
 */

import { getPool, isDatabaseConfigured } from "../db/connection";
import { ensureDatabase } from "../db/migration";

const PUBLISHED_WHERE = `p.status = 'active' and p.published_at is not null`;

export interface StorefrontProductImage {
  url: string;
  alt: string;
}

export interface StorefrontProductSummary {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  unit: string;
  price: number;
  stock: number;
  category_id: string | null;
  category_name: string | null;
  image_url: string;
}

export interface StorefrontProductDetail extends StorefrontProductSummary {
  description: string;
  images: StorefrontProductImage[];
}

export interface StorefrontCategory {
  id: string;
  name: string;
  slug: string;
  image_url: string;
  product_count: number;
}

function normalizeSearch(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "");
}

export async function listStorefrontProducts(opts: {
  search?: string;
  category_slug?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<{ products: StorefrontProductSummary[]; total: number; page: number; page_size: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, Math.min(60, opts.page_size ?? 24));
  if (!isDatabaseConfigured) return { products: [], total: 0, page, page_size: pageSize };
  await ensureDatabase();
  const pool = getPool();

  const where: string[] = [PUBLISHED_WHERE];
  const params: any[] = [];
  let i = 1;
  let orderBy = "p.published_at desc";
  let qNorm = "";

  const search = (opts.search ?? "").trim();
  if (search) {
    qNorm = normalizeSearch(search);
    where.push(
      `(p.name ilike $${i} or p.sku ilike $${i} or coalesce(p.search_text,'') ilike $${i + 1} or similarity(coalesce(p.search_text,''), $${i + 2}) > 0.2)`
    );
    params.push(`%${search}%`, `%${qNorm}%`, qNorm);
    i += 3;
    orderBy = `similarity(coalesce(p.search_text,''), $${i - 1}) desc, p.name asc`;
  }
  if (opts.category_slug) {
    where.push(`c.slug = $${i++}`);
    params.push(opts.category_slug);
  }

  const whereSql = `where ${where.join(" and ")}`;
  const offset = (page - 1) * pageSize;

  const [countRes, dataRes] = await Promise.all([
    pool.query(`select count(*)::int as cnt from products p left join categories c on c.id = p.category_id ${whereSql}`, params),
    pool.query(
      `select
         p.id, p.name, p.slug, p.short_description, p.unit,
         p.price, coalesce(p.stock, 0) as stock,
         p.category_id, c.name as category_name,
         coalesce((select url from product_images where product_id = p.id order by position asc limit 1), '') as image_url
       from products p
       left join categories c on c.id = p.category_id
       ${whereSql}
       order by ${orderBy}
       limit ${pageSize} offset ${offset}`,
      params
    ),
  ]);

  return {
    products: dataRes.rows.map(rowToSummary),
    total: countRes.rows[0]?.cnt ?? 0,
    page,
    page_size: pageSize,
  };
}

function rowToSummary(row: any): StorefrontProductSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    short_description: row.short_description ?? "",
    unit: row.unit ?? "",
    price: Number(row.price ?? 0),
    stock: Number(row.stock ?? 0),
    category_id: row.category_id ?? null,
    category_name: row.category_name ?? null,
    image_url: row.image_url ?? "",
  };
}

export async function getStorefrontProductBySlug(slug: string): Promise<StorefrontProductDetail | null> {
  if (!isDatabaseConfigured) return null;
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(
    `select
       p.id, p.name, p.slug, p.short_description, p.description, p.unit,
       p.price, coalesce(p.stock, 0) as stock,
       p.category_id, c.name as category_name
     from products p
     left join categories c on c.id = p.category_id
     where p.slug = $1 and ${PUBLISHED_WHERE}
     limit 1`,
    [slug]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];

  const imagesRes = await pool.query(
    `select url, coalesce(alt, '') as alt from product_images where product_id = $1 order by position asc`,
    [row.id]
  );
  const images: StorefrontProductImage[] = imagesRes.rows.map((r) => ({ url: r.url, alt: r.alt }));

  return {
    ...rowToSummary({ ...row, image_url: images[0]?.url ?? "" }),
    description: row.description ?? "",
    images,
  };
}

export async function listStorefrontCategories(): Promise<StorefrontCategory[]> {
  if (!isDatabaseConfigured) return [];
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(
    `select
       c.id, c.name, c.slug, coalesce(c.image_url, '') as image_url,
       count(p.id)::int as product_count
     from categories c
     left join products p on p.category_id = c.id and ${PUBLISHED_WHERE}
     group by c.id
     having count(p.id) > 0
     order by c.position asc, c.name asc`
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    image_url: r.image_url,
    product_count: r.product_count,
  }));
}
