/**
 * lib/storefront/catalog.ts — đọc sản phẩm/danh mục công khai cho website bán
 * hàng. CHỈ trả field an toàn để hiển thị công khai — không bao giờ select
 * cost_price/preferred_supplier/reorder_point... (dữ liệu nội bộ). Sản phẩm
 * hiển thị trên website khi status='active' VÀ (đã bật toggle "Hiển thị trên
 * website" ở /products/pricing — published_at khác null, xem STOREFRONT_PLAN.md
 * mục 6.1 — HOẶC tồn kho còn trên 0). Auto-hiển thị theo tồn kho (2026-08-18,
 * theo yêu cầu) để sản phẩm còn hàng hiện lên web ngay không cần bật tay từng
 * cái; published_at vẫn là override thủ công (bật rồi thì hiện bất kể tồn kho
 * bao nhiêu, kể cả 0 — vd sản phẩm đặt trước).
 */

import { getPool, isDatabaseConfigured } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { getDemoCategories, getDemoProductBySlug, getDemoProducts, isDemoMode } from "./demoData";

// FIX (theo feedback khách): web chỉ hiện sản phẩm còn tồn kho. Điều kiện cũ
// "stock > 1" vô tình ẩn luôn sản phẩm chỉ còn đúng 1 cái — đổi thành
// "stock > 0" để mọi sản phẩm còn hàng (kể cả còn 1) đều hiện lên web.
const PUBLISHED_WHERE = `p.status = 'active' and (p.published_at is not null or coalesce(p.stock, 0) > 0)`;

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
  compare_at_price: number | null;
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

interface RealCategoryRef {
  id: string;
  name: string;
  slug: string;
}

// Demo mode (lib/storefront/demoData.ts) đặt tên danh mục giả trùng ý nghĩa
// với danh mục thật khi có thể (vd "Phụ kiện tóc") — tra map này để MERGE
// theo tên thay vì hiện 2 pill trùng tên (1 thật + 1 giả) ở sidebar/header.
async function fetchRealCategoryRefs(pool: ReturnType<typeof getPool>): Promise<RealCategoryRef[]> {
  const res = await pool.query(`select id, name, slug from categories`);
  return res.rows;
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
  const pageSize = Math.max(1, Math.min(300, opts.page_size ?? 24));
  if (!isDatabaseConfigured) {
    const demo = isDemoMode() ? getDemoProducts({ search: opts.search, category_slug: opts.category_slug }) : [];
    return { products: demo, total: demo.length, page, page_size: pageSize };
  }
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
         p.price, p.compare_at_price, coalesce(p.stock, 0) as stock,
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

  const realProducts = dataRes.rows.map(rowToSummary);
  const realTotal = countRes.rows[0]?.cnt ?? 0;

  // Demo mode (xem lib/storefront/demoData.ts) — chèn thêm sản phẩm giả vào
  // TRANG ĐẦU để không lặp lại khi khách/bạn phân trang; chỉ chạy khi
  // NODE_ENV !== 'production' nên không thể lọt lên web live.
  if (isDemoMode()) {
    const realCats = await fetchRealCategoryRefs(pool);
    const byNameLower = new Map(realCats.map((c) => [c.name.trim().toLowerCase(), c]));
    const bySlug = new Map(realCats.map((c) => [c.slug, c]));
    const targetCategoryName = opts.category_slug ? bySlug.get(opts.category_slug)?.name : undefined;
    const demo = getDemoProducts({
      search: opts.search,
      category_slug: opts.category_slug,
      category_name: targetCategoryName,
    }).map((d) => {
      const match = d.category_name ? byNameLower.get(d.category_name.trim().toLowerCase()) : undefined;
      return match ? { ...d, category_id: match.id, category_name: match.name } : d;
    });
    return {
      products: page === 1 ? [...realProducts, ...demo] : realProducts,
      total: realTotal + demo.length,
      page,
      page_size: pageSize,
    };
  }

  return {
    products: realProducts,
    total: realTotal,
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
    compare_at_price: row.compare_at_price != null ? Number(row.compare_at_price) : null,
    stock: Number(row.stock ?? 0),
    category_id: row.category_id ?? null,
    category_name: row.category_name ?? null,
    image_url: row.image_url ?? "",
  };
}

export async function getStorefrontProductBySlug(slug: string): Promise<StorefrontProductDetail | null> {
  if (!isDatabaseConfigured) return isDemoMode() ? getDemoProductBySlug(slug) : null;
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(
    `select
       p.id, p.name, p.slug, p.short_description, p.description, p.unit,
       p.price, p.compare_at_price, coalesce(p.stock, 0) as stock,
       p.category_id, c.name as category_name
     from products p
     left join categories c on c.id = p.category_id
     where p.slug = $1 and ${PUBLISHED_WHERE}
     limit 1`,
    [slug]
  );
  if (res.rows.length === 0) {
    return isDemoMode() ? getDemoProductBySlug(slug) : null;
  }
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
  const demo = isDemoMode() ? getDemoCategories() : [];
  if (!isDatabaseConfigured) return demo.filter((c) => c.product_count > 0);
  await ensureDatabase();
  const pool = getPool();
  // KHÔNG lọc count(p.id) > 0 ở SQL nữa — cần giữ cả danh mục thật 0 sản
  // phẩm ở đây để merge count demo vào (vd danh mục thật mới tạo, sản phẩm
  // demo cùng tên "đẩy" nó lên >0) — lọc sau khi merge, ở dòng cuối.
  const res = await pool.query(
    `select
       c.id, c.name, c.slug, coalesce(c.image_url, '') as image_url,
       count(p.id)::int as product_count
     from categories c
     left join products p on p.category_id = c.id and ${PUBLISHED_WHERE}
     group by c.id
     order by c.position asc, c.name asc`
  );
  const merged: StorefrontCategory[] = res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    image_url: r.image_url,
    product_count: r.product_count,
  }));
  const byNameLower = new Map(merged.map((c) => [c.name.trim().toLowerCase(), c]));

  // Demo mode: danh mục giả trùng TÊN với danh mục thật → cộng dồn count vào
  // đúng row thật (giữ nguyên id/slug thật, không tạo pill trùng tên thứ 2).
  // Không trùng tên nào → thêm mới như 1 danh mục riêng (thuần demo).
  for (const d of demo) {
    const match = byNameLower.get(d.name.trim().toLowerCase());
    if (match) {
      match.product_count += d.product_count;
    } else {
      merged.push(d);
      byNameLower.set(d.name.trim().toLowerCase(), d);
    }
  }

  return merged.filter((c) => c.product_count > 0);
}