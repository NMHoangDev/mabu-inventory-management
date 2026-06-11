import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getPool, isDatabaseConfigured } from "../db/connection";
import { ensureDatabase } from "../db/migration";

export interface Category {
  id: string;
  parent_id?: string | null;
  name: string;
  slug?: string | null;
  position?: number;
  description?: string | null;
  type?: string;
  image_url?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  sales_channels?: string[];
  theme_template?: string;
  product_count?: number;
  created_at?: string;
}

const dataDir = process.env.INVOICEFLOW_DATA_DIR ?? (process.env.VERCEL ? path.join(os.tmpdir(), "invoiceflow") : path.join(process.cwd(), "data"));
const categoriesFilePath = path.join(dataDir, "categories-store.json");

async function getOfflineCategories(): Promise<Category[]> {
  try {
    const raw = await fs.readFile(categoriesFilePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

async function saveOfflineCategories(categories: Category[]) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(categoriesFilePath, JSON.stringify(categories, null, 2), "utf8");
}

export async function getCategories(): Promise<Category[]> {
  if (!isDatabaseConfigured) {
    return getOfflineCategories();
  }
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(`
    select c.*, count(p.id)::int as product_count 
    from categories c 
    left join products p on p.category_id = c.id 
    group by c.id 
    order by c.name asc
  `);
  return res.rows;
}

export async function createCategory(input: Omit<Category, "id">): Promise<Category> {
  const baseSlug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
  
  if (!isDatabaseConfigured) {
    const categories = await getOfflineCategories();
    const newCat: Category = {
      ...input,
      id: crypto.randomUUID(),
      slug,
      product_count: 0,
      created_at: new Date().toISOString()
    };
    categories.push(newCat);
    await saveOfflineCategories(categories);
    return newCat;
  }

  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(`
    insert into categories (
      name, slug, description, type, image_url, seo_title, seo_description, sales_channels, theme_template
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    returning *, 0 as product_count
  `, [
    input.name,
    slug,
    input.description || "",
    input.type || "manual",
    input.image_url || "",
    input.seo_title || "",
    input.seo_description || "",
    input.sales_channels || [],
    input.theme_template || "collection"
  ]);
  return res.rows[0];
}

export async function deleteCategory(id: string): Promise<boolean> {
  if (!isDatabaseConfigured) {
    const categories = await getOfflineCategories();
    const filtered = categories.filter((c) => c.id !== id);
    if (filtered.length === categories.length) return false;
    await saveOfflineCategories(filtered);
    return true;
  }

  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(`delete from categories where id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}
