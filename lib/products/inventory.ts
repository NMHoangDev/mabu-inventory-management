import { getPool, isDatabaseConfigured } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { getProducts } from "./repository";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_RE.test(String(value ?? "").trim());
}

export type InventoryProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  status: string;
  created_at: string;
  updated_at: string;
  price: number;
  cost_price: number;
  wholesale_price: number;
  total_inventory: number;
  available_quantity: number;
  on_hold_quantity: number;
  image_url: string;
  category_name: string;
  brand_name: string;
  type_name: string;
};

export type InventoryLocation = {
  id: string;
  name: string;
  quantity: number;
  quantity_on_hold: number;
  available_quantity: number;
  cost_price: number;
  incoming_quantity: number;
  delivering_quantity: number;
  min_stock: number | null;
  max_stock: number | null;
  storage_location: string;
};

export type InventoryProductDetail = InventoryProduct & {
  description: string;
  short_description: string;
  tax_group: string;
  tags: string[];
  taxable: boolean;
  track_inventory: boolean;
  allow_negative_stock: boolean;
  manage_expiry: boolean;
  weight: number;
  weight_unit: string;
  images: string[];
  locations: InventoryLocation[];
};

function numberValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function textValue(value: unknown) {
  return String(value ?? "").trim();
}

function mapOfflineProduct(product: any): InventoryProduct {
  const total = numberValue(product.total_inventory ?? product.stock);
  return {
    id: textValue(product.id),
    name: textValue(product.name),
    sku: textValue(product.sku),
    barcode: textValue(product.barcode),
    unit: textValue(product.unit),
    status: textValue(product.status || "active"),
    created_at: textValue(product.created_at),
    updated_at: textValue(product.updated_at || product.created_at),
    price: numberValue(product.price),
    cost_price: numberValue(product.cost_price),
    wholesale_price: numberValue(product.wholesale_price),
    total_inventory: total,
    available_quantity: total,
    on_hold_quantity: 0,
    image_url: textValue(product.image_url),
    category_name: textValue(product.category_name),
    brand_name: textValue(product.brand_name),
    type_name: textValue(product.type_name || "Sáº£n pháº©m thÆ°á»ng")
  };
}

export async function listInventoryProducts(): Promise<InventoryProduct[]> {
  if (!isDatabaseConfigured) {
    const products = await getProducts();
    return products.map(mapOfflineProduct);
  }

  await ensureDatabase();
  const result = await getPool().query(`
    select
      p.id,
      p.name,
      coalesce(p.sku, '') as sku,
      coalesce(p.barcode, '') as barcode,
      coalesce(p.unit, '') as unit,
      coalesce(p.status, 'active') as status,
      p.created_at,
      p.updated_at,
      coalesce(p.price, 0) as price,
      coalesce(p.cost_price, 0) as cost_price,
      coalesce(p.compare_at_price, 0) as wholesale_price,
      coalesce(c.name, '') as category_name,
      coalesce(b.name, '') as brand_name,
      coalesce(t.name, 'Sáº£n pháº©m thÆ°á»ng') as type_name,
      coalesce(img.url, '') as image_url,
      coalesce(sum(il.quantity), 0)::numeric as total_inventory,
      coalesce(sum(il.quantity_on_hold), 0)::numeric as on_hold_quantity,
      greatest(coalesce(sum(il.quantity), 0) - coalesce(sum(il.quantity_on_hold), 0), 0)::numeric as available_quantity
    from products p
    left join categories c on c.id = p.category_id
    left join brands b on b.id = p.brand_id
    left join product_types t on t.id = p.product_type_id
    left join product_variants pv on pv.product_id = p.id
    left join inventory_levels il on il.variant_id = pv.id
    left join lateral (
      select url from product_images where product_id = p.id order by position asc limit 1
    ) img on true
    group by p.id, c.name, b.name, t.name, img.url
    order by p.created_at desc
  `);

  return result.rows.map((row) => ({
    id: row.id,
    name: textValue(row.name),
    sku: textValue(row.sku),
    barcode: textValue(row.barcode),
    unit: textValue(row.unit),
    status: textValue(row.status),
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at),
    price: numberValue(row.price),
    cost_price: numberValue(row.cost_price),
    wholesale_price: numberValue(row.wholesale_price),
    total_inventory: numberValue(row.total_inventory),
    available_quantity: numberValue(row.available_quantity),
    on_hold_quantity: numberValue(row.on_hold_quantity),
    image_url: textValue(row.image_url),
    category_name: textValue(row.category_name),
    brand_name: textValue(row.brand_name),
    type_name: textValue(row.type_name)
  }));
}

export async function getInventoryProductDetail(id: string): Promise<InventoryProductDetail | null> {
  // products.id là uuid — nếu id không phải UUID thì return null sớm để tránh
  // PostgreSQL throw "invalid input syntax for type uuid".
  if (!isUuid(id)) return null;
  if (!isDatabaseConfigured) {
    const product = (await getProducts()).find((item: any) => String(item.id) === id);
    if (!product) return null;
    const base = mapOfflineProduct(product);
    return {
      ...base,
      description: textValue(product.description),
      short_description: textValue(product.short_description),
      tax_group: textValue(product.tax_group),
      tags: Array.isArray(product.tags) ? product.tags : [],
      taxable: Boolean(product.taxable),
      track_inventory: product.track_inventory !== false,
      allow_negative_stock: Boolean(product.allow_negative_stock),
      manage_expiry: Boolean(product.manage_expiry),
      weight: numberValue(product.weight),
      weight_unit: textValue(product.weight_unit || "g"),
      images: base.image_url ? [base.image_url] : [],
      locations: [{
        id: "default",
        name: "Chi nhÃ¡nh máº·c Ä‘á»‹nh",
        quantity: base.total_inventory,
        quantity_on_hold: 0,
        available_quantity: base.available_quantity,
        cost_price: base.cost_price,
        incoming_quantity: 0,
        delivering_quantity: 0,
        min_stock: null,
        max_stock: null,
        storage_location: ""
      }]
    };
  }

  await ensureDatabase();
  const pool = getPool();
  const productResult = await pool.query(`
    select
      p.*,
      coalesce(c.name, '') as category_name,
      coalesce(b.name, '') as brand_name,
      coalesce(t.name, 'Sáº£n pháº©m thÆ°á»ng') as type_name,
      coalesce(imgs.images, '{}') as images,
      coalesce(sum(il.quantity), 0)::numeric as total_inventory,
      coalesce(sum(il.quantity_on_hold), 0)::numeric as on_hold_quantity,
      greatest(coalesce(sum(il.quantity), 0) - coalesce(sum(il.quantity_on_hold), 0), 0)::numeric as available_quantity
    from products p
    left join categories c on c.id = p.category_id
    left join brands b on b.id = p.brand_id
    left join product_types t on t.id = p.product_type_id
    left join lateral (
      select array_agg(url order by position asc) as images
      from product_images
      where product_id = p.id
    ) imgs on true
    left join product_variants pv on pv.product_id = p.id
    left join inventory_levels il on il.variant_id = pv.id
    where p.id = $1::uuid
    group by p.id, c.name, b.name, t.name, imgs.images
    limit 1
  `, [id]);

  if (productResult.rows.length === 0) return null;
  const row = productResult.rows[0];

  const locationResult = await pool.query(`
    select
      l.id,
      l.name,
      coalesce(sum(il.quantity), 0)::numeric as quantity,
      coalesce(sum(il.quantity_on_hold), 0)::numeric as quantity_on_hold,
      greatest(coalesce(sum(il.quantity), 0) - coalesce(sum(il.quantity_on_hold), 0), 0)::numeric as available_quantity,
      coalesce(avg(pv.cost_price), avg(p.cost_price), 0)::numeric as cost_price,
      0::numeric as incoming_quantity,
      0::numeric as delivering_quantity,
      null::numeric as min_stock,
      null::numeric as max_stock,
      coalesce(max(il.storage_location), '') as storage_location
    from locations l
    left join product_variants pv on pv.product_id = $1
    left join inventory_levels il on il.location_id = l.id and il.variant_id = pv.id
    left join products p on p.id = $1
    where l.is_active = true
    group by l.id, l.name, l.is_default, l.created_at
    order by l.is_default desc, l.created_at asc
  `, [id]);

  const images = Array.isArray(row.images) ? row.images.map(textValue).filter(Boolean) : [];
  return {
    id: row.id,
    name: textValue(row.name),
    sku: textValue(row.sku),
    barcode: textValue(row.barcode),
    unit: textValue(row.unit),
    status: textValue(row.status),
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at),
    price: numberValue(row.price),
    cost_price: numberValue(row.cost_price),
    wholesale_price: numberValue(row.compare_at_price),
    total_inventory: numberValue(row.total_inventory),
    available_quantity: numberValue(row.available_quantity),
    on_hold_quantity: numberValue(row.on_hold_quantity),
    image_url: images[0] || "",
    category_name: textValue(row.category_name),
    brand_name: textValue(row.brand_name),
    type_name: textValue(row.type_name),
    description: textValue(row.description),
    short_description: textValue(row.short_description),
    tax_group: textValue(row.tax_group),
    tags: Array.isArray(row.tags) ? row.tags : [],
    taxable: Boolean(row.taxable),
    track_inventory: row.track_inventory !== false,
    allow_negative_stock: Boolean(row.allow_negative_stock),
    manage_expiry: Boolean(row.manage_expiry),
    weight: numberValue(row.weight),
    weight_unit: textValue(row.weight_unit || "g"),
    images,
    locations: locationResult.rows.map((location) => ({
      id: location.id,
      name: textValue(location.name),
      quantity: numberValue(location.quantity),
      quantity_on_hold: numberValue(location.quantity_on_hold),
      available_quantity: numberValue(location.available_quantity),
      cost_price: numberValue(location.cost_price),
      incoming_quantity: numberValue(location.incoming_quantity),
      delivering_quantity: numberValue(location.delivering_quantity),
      min_stock: location.min_stock === null ? null : numberValue(location.min_stock),
      max_stock: location.max_stock === null ? null : numberValue(location.max_stock),
      storage_location: textValue(location.storage_location)
    }))
  };
}


