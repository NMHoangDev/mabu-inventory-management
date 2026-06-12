import type pg from "pg";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getPool, isDatabaseConfigured, logActivity } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { parseNumeric } from "../shared/format";
import { readJsonStore, writeJsonStoreNow } from "../shared/json-store";
import { readStore } from "../invoices/repository";

// Helper function to return a clean string or trimmed value
function cell(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

/**
 * Ensures that a product and its default variant exist in standard tables,
 * and returns the product's UUID.
 */
export async function ensureStandardProduct(
  client: pg.PoolClient | pg.Pool,
  sku: string,
  inputName: string,
  invoiceName: string,
  retailName: string,
  unit: string,
  purchasePrice?: number | string,
  salePrice?: number
) {
  const cleanSku = sku.trim();
  if (!cleanSku) return null;

  // 1. Check if product exists
  const existingProduct = await client.query(
    "select id from products where sku = $1 limit 1",
    [cleanSku]
  );

  let productId: string;
  const costPrice = parseNumeric(purchasePrice) ?? 0;
  const pSalePrice = salePrice ?? 0;

  if (existingProduct.rows.length > 0) {
    productId = existingProduct.rows[0].id;
    // Update existing product and variant cost price / sale price if applicable
    if (costPrice > 0 || pSalePrice > 0) {
      let updateQ = "update products set updated_at = now()";
      let params: any[] = [];
      let idx = 1;
      if (costPrice > 0) {
        updateQ += `, cost_price = $${idx++}`;
        params.push(costPrice);
      }
      if (pSalePrice > 0) {
        updateQ += `, price = $${idx++}`;
        params.push(pSalePrice);
      }
      updateQ += ` where id = $${idx++}`;
      params.push(productId);
      await client.query(updateQ, params);

      let varUpdateQ = "update product_variants set updated_at = now()";
      let varParams: any[] = [];
      let varIdx = 1;
      if (costPrice > 0) {
        varUpdateQ += `, cost_price = $${varIdx++}`;
        varParams.push(costPrice);
      }
      if (pSalePrice > 0) {
        varUpdateQ += `, price = $${varIdx++}`;
        varParams.push(pSalePrice);
      }
      varUpdateQ += ` where product_id = $${varIdx++} and sku = $${varIdx++}`;
      varParams.push(productId, cleanSku);
      await client.query(varUpdateQ, varParams);
    }
  } else {
    // 2. Create standard product
    const productName = retailName || invoiceName || inputName || `Sản phẩm ${cleanSku}`;
    const productInsert = await client.query(
      `
        insert into products 
          (id, name, sku, unit, price, cost_price, status, created_at, updated_at)
        values (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', now(), now())
        returning id
      `,
      [productName, cleanSku, unit, pSalePrice, costPrice]
    );
    productId = productInsert.rows[0].id;

    // 3. Create default variant
    await client.query(
      `
        insert into product_variants
          (id, product_id, title, sku, price, cost_price, position, created_at, updated_at)
        values (gen_random_uuid(), $1, 'Mặc định', $2, $3, $4, 1, now(), now())
      `,
      [productId, cleanSku, pSalePrice, costPrice]
    );
  }

  return productId;
}

/**
 * Updates or inserts catalog mapping and master product details
 */
export async function upsertCatalogProductMeta(input: {
  sku: string;
  inputProductName?: string;
  adjustedInvoiceName?: string;
  retailName?: string;
  unit?: string;
  salePrice?: string;
  imageUrl?: string;
}) {
  const sku = cell(input.sku);
  if (!sku) return;

  if (!isDatabaseConfigured) return;

  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const inputName = cell(input.inputProductName);
    const invoiceName = cell(input.adjustedInvoiceName);
    const retailName = cell(input.retailName);
    const unit = cell(input.unit);
    const salePriceNumeric = parseNumeric(input.salePrice) ?? 0;
    const imageUrl = cell(input.imageUrl);

    // 1. Ensure standard product exists in products and product_variants
    const productId = await ensureStandardProduct(
      client,
      sku,
      inputName,
      invoiceName,
      retailName,
      unit,
      undefined,
      salePriceNumeric
    );

    // 2. Upsert into product_catalog
    await client.query(
      `
        insert into product_catalog
          (sku, input_name, invoice_name, retail_name, unit, sale_price, image_url, product_id, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, now())
        on conflict (sku)
        do update set
          input_name = coalesce(nullif(excluded.input_name, ''), product_catalog.input_name),
          invoice_name = coalesce(nullif(excluded.invoice_name, ''), product_catalog.invoice_name),
          retail_name = coalesce(nullif(excluded.retail_name, ''), product_catalog.retail_name),
          unit = coalesce(nullif(excluded.unit, ''), product_catalog.unit),
          sale_price = excluded.sale_price,
          image_url = excluded.image_url,
          product_id = coalesce(excluded.product_id, product_catalog.product_id),
          updated_at = now()
      `,
      [
        sku,
        inputName,
        invoiceName,
        retailName,
        unit,
        salePriceNumeric,
        imageUrl,
        productId
      ]
    );

    // 3. Update master products and variants with the user inputs (retail name, sale price, unit)
    if (productId) {
      const finalProductName = retailName || invoiceName || inputName;
      if (finalProductName) {
        await client.query(
          `
            update products set
              name = $1,
              unit = coalesce(nullif($2, ''), unit),
              price = $3,
              updated_at = now()
            where id = $4
          `,
          [finalProductName, unit, salePriceNumeric, productId]
        );

        await client.query(
          `
            update product_variants set
              price = $1,
              updated_at = now()
            where product_id = $2 and sku = $3
          `,
          [salePriceNumeric, productId, sku]
        );
      }
    }

    await client.query("commit");
    await logActivity("product", `Cập nhật sản phẩm chuẩn ${sku}`);
  } catch (error) {
    await client.query("rollback");
    console.error("Failed to upsert standard product meta:", error);
    throw error;
  } finally {
    client.release();
  }
}

export interface ProductInput {
  name: string;
  sku?: string;
  barcode?: string;
  unit?: string;
  description?: string;
  price?: number;
  compare_at_price?: number;
  cost_price?: number;
  taxable?: boolean;
  track_inventory?: boolean;
  allow_negative_stock?: boolean;
  manage_expiry?: boolean;
  weight?: number;
  weight_unit?: string;
  category_id?: string | null;
  brand_id?: string | null;
  product_type_id?: string | null;
  tags?: string[];
  sales_channels?: string[];
  theme_template?: string;
  status?: string;
  image_url?: string;
  variants?: {
    title: string;
    sku: string;
    price: number;
    cost_price: number;
    barcode?: string;
  }[];
}

const dataDir = process.env.INVOICEFLOW_DATA_DIR ?? (process.env.VERCEL ? path.join(os.tmpdir(), "invoiceflow") : path.join(process.cwd(), "data"));
const productsFilePath = path.join(dataDir, "products-store.json");

async function getOfflineProducts(): Promise<any[]> {
  try {
    const raw = await fs.readFile(productsFilePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

async function saveOfflineProducts(products: any[]) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(productsFilePath, JSON.stringify(products, null, 2), "utf8");
}

export async function getProducts() {
  if (!isDatabaseConfigured) {
    return getOfflineProducts();
  }
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(`
    select 
      p.*,
      c.name as category_name,
      b.name as brand_name,
      t.name as type_name,
      count(distinct pv.id)::int as variant_count,
      coalesce(sum(il.quantity), 0)::int as total_inventory
    from products p
    left join categories c on c.id = p.category_id
    left join brands b on b.id = p.brand_id
    left join product_types t on t.id = p.product_type_id
    left join product_variants pv on pv.product_id = p.id
    left join inventory_levels il on il.variant_id = pv.id
    group by p.id, c.name, b.name, t.name
    order by p.created_at desc
  `);
  return res.rows;
}

export async function createProduct(input: ProductInput) {
  const pool = getPool();

  if (!isDatabaseConfigured) {
    const products = await getOfflineProducts();
    const productId = crypto.randomUUID();
    const newProduct = {
      id: productId,
      name: input.name,
      sku: input.sku || `SKU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      barcode: input.barcode || "",
      unit: input.unit || "cái",
      description: input.description || "",
      price: input.price ?? 0,
      compare_at_price: input.compare_at_price ?? 0,
      cost_price: input.cost_price ?? 0,
      taxable: !!input.taxable,
      track_inventory: input.track_inventory !== false,
      allow_negative_stock: !!input.allow_negative_stock,
      manage_expiry: !!input.manage_expiry,
      weight: input.weight ?? 0,
      weight_unit: input.weight_unit || "g",
      category_id: input.category_id || null,
      brand_id: input.brand_id || null,
      product_type_id: input.product_type_id || null,
      tags: input.tags || [],
      sales_channels: input.sales_channels || [],
      theme_template: input.theme_template || "product",
      status: input.status || "active",
      image_url: input.image_url || "",
      created_at: new Date().toISOString(),
      variant_count: input.variants?.length || 1,
      total_inventory: 0
    };
    products.push(newProduct);
    await saveOfflineProducts(products);
    return newProduct;
  }

  await ensureDatabase();
  const client = await pool.connect();
  try {
    await client.query("begin");
    
    // 1. Insert product
    const pSku = input.sku || `SKU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const productRes = await client.query(`
      insert into products (
        name, sku, barcode, unit, description, price, compare_at_price, cost_price, 
        taxable, track_inventory, allow_negative_stock, manage_expiry, weight, weight_unit, 
        category_id, brand_id, product_type_id, tags, sales_channels, theme_template, status, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, now(), now())
      returning *
    `, [
      input.name,
      pSku,
      input.barcode || "",
      input.unit || "cái",
      input.description || "",
      input.price ?? 0,
      input.compare_at_price ?? null,
      input.cost_price ?? 0,
      !!input.taxable,
      input.track_inventory !== false,
      !!input.allow_negative_stock,
      !!input.manage_expiry,
      input.weight ?? 0,
      input.weight_unit || "g",
      input.category_id || null,
      input.brand_id || null,
      input.product_type_id || null,
      input.tags || [],
      input.sales_channels || [],
      input.theme_template || "product",
      input.status || "active"
    ]);
    const product = productRes.rows[0];

    // 2. Insert image if provided
    if (input.image_url) {
      await client.query(`
        insert into product_images (product_id, url, position, created_at)
        values ($1, $2, 1, now())
      `, [product.id, input.image_url]);
    }

    // 3. Insert variants
    const variants = input.variants && input.variants.length > 0 ? input.variants : [{
      title: "Mặc định",
      sku: pSku,
      price: input.price ?? 0,
      cost_price: input.cost_price ?? 0,
      barcode: input.barcode
    }];

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const vSku = v.sku || `${pSku}-${i}`;
      await client.query(`
        insert into product_variants (
          product_id, title, sku, barcode, price, cost_price, position, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, now(), now())
      `, [
        product.id,
        v.title,
        vSku,
        v.barcode || "",
        v.price,
        v.cost_price,
        i + 1
      ]);
    }

    // Also populate product_catalog for lookup consistency!
    await client.query(`
      insert into product_catalog (
        sku, input_name, invoice_name, retail_name, unit, sale_price, image_url, product_id, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
      on conflict (sku) do update set
        input_name = excluded.input_name,
        retail_name = excluded.retail_name,
        unit = excluded.unit,
        sale_price = excluded.sale_price,
        image_url = excluded.image_url,
        product_id = excluded.product_id,
        updated_at = now()
    `, [
      pSku,
      input.name,
      input.name,
      input.name,
      input.unit || "cái",
      input.price ?? 0,
      input.image_url || "",
      product.id
    ]);

    await client.query("commit");
    await logActivity("product", `Tạo sản phẩm mới ${input.name} (SKU: ${pSku})`);
    return product;
  } catch (error) {
    await client.query("rollback");
    console.error("Failed to create product:", error);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteProduct(id: string): Promise<boolean> {
  if (!isDatabaseConfigured) {
    const products = await getOfflineProducts();
    const filtered = products.filter((p) => p.id !== id);
    if (filtered.length === products.length) return false;
    await saveOfflineProducts(filtered);
    return true;
  }

  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(`delete from products where id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function updateProduct(id: string, input: ProductInput) {
  const pool = getPool();

  if (!isDatabaseConfigured) {
    const products = await getOfflineProducts();
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) return null;

    products[index] = {
      ...products[index],
      name: input.name,
      sku: input.sku || products[index].sku,
      barcode: input.barcode ?? products[index].barcode,
      unit: input.unit ?? products[index].unit,
      description: input.description ?? products[index].description,
      price: input.price ?? products[index].price,
      compare_at_price: input.compare_at_price ?? products[index].compare_at_price,
      cost_price: input.cost_price ?? products[index].cost_price,
      taxable: input.taxable !== undefined ? !!input.taxable : products[index].taxable,
      track_inventory: input.track_inventory !== undefined ? !!input.track_inventory : products[index].track_inventory,
      allow_negative_stock: input.allow_negative_stock !== undefined ? !!input.allow_negative_stock : products[index].allow_negative_stock,
      manage_expiry: input.manage_expiry !== undefined ? !!input.manage_expiry : products[index].manage_expiry,
      weight: input.weight ?? products[index].weight,
      weight_unit: input.weight_unit ?? products[index].weight_unit,
      category_id: input.category_id !== undefined ? input.category_id : products[index].category_id,
      tags: input.tags ?? products[index].tags,
      sales_channels: input.sales_channels ?? products[index].sales_channels,
      theme_template: input.theme_template ?? products[index].theme_template,
      image_url: input.image_url ?? products[index].image_url
    };

    await saveOfflineProducts(products);
    return products[index];
  }

  await ensureDatabase();
  const client = await pool.connect();
  try {
    await client.query("begin");

    // 1. Update product main details
    await client.query(`
      update products set
        name = $1,
        sku = $2,
        barcode = $3,
        unit = $4,
        description = $5,
        price = $6,
        compare_at_price = $7,
        cost_price = $8,
        taxable = $9,
        track_inventory = $10,
        allow_negative_stock = $11,
        manage_expiry = $12,
        weight = $13,
        weight_unit = $14,
        category_id = $15,
        tags = $16,
        sales_channels = $17,
        theme_template = $18,
        updated_at = now()
      where id = $19
    `, [
      input.name,
      input.sku,
      input.barcode || "",
      input.unit || "cái",
      input.description || "",
      input.price ?? 0,
      input.compare_at_price ?? null,
      input.cost_price ?? 0,
      !!input.taxable,
      input.track_inventory !== false,
      !!input.allow_negative_stock,
      !!input.manage_expiry,
      input.weight ?? 0,
      input.weight_unit || "g",
      input.category_id || null,
      input.tags || [],
      input.sales_channels || [],
      input.theme_template || "product",
      id
    ]);

    // 2. Upsert product_catalog for mapping consistency
    await client.query(`
      insert into product_catalog (
        sku, input_name, invoice_name, retail_name, unit, sale_price, image_url, product_id, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
      on conflict (sku) do update set
        input_name = excluded.input_name,
        retail_name = excluded.retail_name,
        unit = excluded.unit,
        sale_price = excluded.sale_price,
        image_url = excluded.image_url,
        updated_at = now()
    `, [
      input.sku,
      input.name,
      input.name,
      input.name,
      input.unit || "cái",
      input.price ?? 0,
      input.image_url || "",
      id
    ]);

    // 3. Update main variant price/cost
    await client.query(`
      update product_variants set
        price = $1,
        cost_price = $2,
        updated_at = now()
      where product_id = $3 and position = 1
    `, [input.price ?? 0, input.cost_price ?? 0, id]);

    // 4. Update image in product_images
    if (input.image_url) {
      const imgRes = await client.query(`
        select id from product_images where product_id = $1 limit 1
      `, [id]);
      if (imgRes.rows.length > 0) {
        await client.query(`
          update product_images set url = $1 where id = $2
        `, [input.image_url, imgRes.rows[0].id]);
      } else {
        await client.query(`
          insert into product_images (product_id, url, position, created_at)
          values ($1, $2, 1, now())
        `, [id, input.image_url]);
      }
    }

    await client.query("commit");
    await logActivity("product", `Cập nhật sản phẩm ${input.name} (ID: ${id})`);
    return { id, ...input };
  } catch (error) {
    await client.query("rollback");
    console.error("Failed to update product:", error);
    throw error;
  } finally {
    client.release();
  }
}

export async function addInventoryFromScan(productId: string, rowIds: string[]) {
  if (!isDatabaseConfigured) {
    const store = await readJsonStore();
    const rows = store.rows.filter((r) => rowIds.includes(r.id) && !r.productSyncedAt);
    const totalQty = rows.reduce((acc, r) => acc + (parseFloat(String(r.quantity)) || 0), 0);

    const products = await getOfflineProducts();
    const index = products.findIndex((p) => p.id === productId);
    if (index !== -1) {
      products[index].total_inventory = (products[index].total_inventory ?? 0) + totalQty;
      await saveOfflineProducts(products);
    }

    const targetProduct = products.find((p) => p.id === productId);
    if (targetProduct) {
      for (const row of store.rows) {
        if (rowIds.includes(row.id)) {
          row.internalProductCode = targetProduct.sku;
          row.retailName = targetProduct.name;
          row.adjustedInvoiceName = targetProduct.name;
          row.unit = targetProduct.unit;
          if (!row.productSyncedAt) {
            row.productSyncedAt = new Date().toISOString();
            row.syncedProductId = targetProduct.id;
            row.inventoryAddedQuantity = String(row.quantity ?? "");
          }
        }
      }
      await writeJsonStoreNow(store);
    }
    return true;
  }

  await ensureDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    // 1. Get target product details
    const prodRes = await client.query(`
      select id, name, sku, unit, price from products where id = $1 limit 1
    `, [productId]);
    if (prodRes.rows.length === 0) {
      throw new Error("Sản phẩm mục tiêu không tồn tại.");
    }
    const product = prodRes.rows[0];

    // 2. Fetch candidate rows to calculate total quantity
    const rowsRes = await client.query(`
      select id, quantity from invoice_rows where id = any($1) and product_synced_at is null
    `, [rowIds]);
    const totalQty = rowsRes.rows.reduce((acc, row) => acc + (parseFloat(String(row.quantity)) || 0), 0);

    // 3. Get or create default variant
    let variantId: string;
    const varRes = await client.query(`
      select id from product_variants where product_id = $1 order by position asc limit 1
    `, [productId]);
    if (varRes.rows.length > 0) {
      variantId = varRes.rows[0].id;
    } else {
      const newVar = await client.query(`
        insert into product_variants (product_id, title, sku, price, cost_price, position, created_at, updated_at)
        values ($1, 'Mặc định', $2, $3, 0, 1, now(), now())
        returning id
      `, [productId, product.sku || `SKU-${productId.substring(0, 8)}`, product.price]);
      variantId = newVar.rows[0].id;
    }

    // 4. Get default location
    let locationId: string;
    const locRes = await client.query(`
      select id from locations order by is_default desc, created_at asc limit 1
    `);
    if (locRes.rows.length > 0) {
      locationId = locRes.rows[0].id;
    } else {
      const newLoc = await client.query(`
        insert into locations (name, is_default, is_active, created_at, updated_at)
        values ('Cửa hàng chính', true, true, now(), now())
        returning id
      `);
      locationId = newLoc.rows[0].id;
    }

    // 5. Update inventory_levels
    await client.query(`
      insert into inventory_levels (variant_id, location_id, quantity, updated_at)
      values ($1, $2, $3, now())
      on conflict (variant_id, location_id) do update set
        quantity = inventory_levels.quantity + excluded.quantity,
        updated_at = now()
    `, [variantId, locationId, totalQty]);

    // 6. Update scanned invoice rows
    await client.query(`
      update invoice_rows set
        internal_product_code = $1,
        retail_name = $2,
        adjusted_invoice_name = $2,
        unit = $3,
        synced_product_id = $5,
        product_synced_at = now(),
        inventory_added_quantity = quantity,
        updated_at = now()
      where id = any($4)
        and product_synced_at is null
    `, [product.sku, product.name, product.unit, rowIds, productId]);

    // 7. Update catalog mapping
    await client.query(`
      insert into product_catalog (
        sku, input_name, invoice_name, retail_name, unit, sale_price, product_id, updated_at
      ) values ($1, $2, $2, $2, $3, $4, $5, now())
      on conflict (sku) do update set
        product_id = excluded.product_id,
        updated_at = now()
    `, [product.sku, product.name, product.unit, product.price, productId]);

    await client.query("commit");
    await logActivity("product", `Cập nhật tồn kho thêm ${totalQty} ${product.unit} cho sản phẩm ${product.name} từ hóa đơn scan.`);
    return true;
  } catch (error) {
    await client.query("rollback");
    console.error("Failed to map candidate to existing product:", error);
    throw error;
  } finally {
    client.release();
  }
}

type InventorySyncResult = {
  syncedRowCount: number;
  skippedRowCount: number;
  createdProductCount: number;
  updatedProductCount: number;
  totalQuantity: number;
};

function rowSku(row: Record<string, unknown>) {
  return cell(row.internalProductCode ?? row.internal_product_code);
}

function rowQuantity(row: Record<string, unknown>) {
  return parseNumeric(cell(row.quantity)) ?? 0;
}

export async function addInvoiceRowsToInventory(rowIds: string[]) {
  const ids = Array.from(new Set(rowIds.map((id) => cell(id)).filter(Boolean)));
  const emptyResult: InventorySyncResult = {
    syncedRowCount: 0,
    skippedRowCount: ids.length,
    createdProductCount: 0,
    updatedProductCount: 0,
    totalQuantity: 0
  };

  if (ids.length === 0) return { store: await readJsonStore(), result: emptyResult };

  if (!isDatabaseConfigured) {
    const store = await readJsonStore();
    const candidateRows = store.rows.filter((row) => ids.includes(row.id));
    const rows = candidateRows.filter((row) => !row.productSyncedAt);
    if (rows.length === 0) return { store, result: { ...emptyResult, skippedRowCount: candidateRows.length } };

    const products = await getOfflineProducts();
    const now = new Date().toISOString();
    const result: InventorySyncResult = {
      syncedRowCount: 0,
      skippedRowCount: candidateRows.length - rows.length,
      createdProductCount: 0,
      updatedProductCount: 0,
      totalQuantity: 0
    };

    for (const row of rows) {
      const sku = cell(row.internalProductCode);
      const qty = parseNumeric(row.quantity) ?? 0;
      if (!sku || qty <= 0) continue;

      let product = products.find((item) => String(item.sku ?? "").trim() === sku);
      if (!product) {
        product = {
          id: crypto.randomUUID(),
          name: cell(row.retailName) || cell(row.adjustedInvoiceName) || cell(row.inputProductName) || sku,
          sku,
          unit: cell(row.unit) || "cái",
          price: 0,
          cost_price: parseNumeric(row.unitPrice) ?? 0,
          status: "active",
          created_at: now,
          total_inventory: 0
        };
        products.push(product);
        result.createdProductCount += 1;
      } else {
        result.updatedProductCount += 1;
      }

      product.total_inventory = (Number(product.total_inventory) || 0) + qty;
      row.productSyncedAt = now;
      row.syncedProductId = product.id;
      row.inventoryAddedQuantity = String(row.quantity ?? qty);
      result.syncedRowCount += 1;
      result.totalQuantity += qty;
    }

    await saveOfflineProducts(products);
    await writeJsonStoreNow(store);
    return { store, result };
  }

  await ensureDatabase();
  const client = await getPool().connect();
  try {
    await client.query("begin");

    const rowsRes = await client.query(
      `
        select *
        from invoice_rows
        where id = any($1::text[])
        order by created_at asc
      `,
      [ids]
    );
    const allRows = rowsRes.rows;
    const rows = allRows.filter((row) => !row.product_synced_at);
    const result: InventorySyncResult = {
      syncedRowCount: 0,
      skippedRowCount: allRows.length - rows.length,
      createdProductCount: 0,
      updatedProductCount: 0,
      totalQuantity: 0
    };

    if (rows.length === 0) {
      await client.query("commit");
      return { store: await readStore(), result };
    }

    const rowsBySku = new Map<string, typeof rows>();
    for (const row of rows) {
      const sku = rowSku(row);
      const qty = rowQuantity(row);
      if (!sku || qty <= 0) continue;
      rowsBySku.set(sku, [...(rowsBySku.get(sku) ?? []), row]);
    }

    for (const [sku, groupRows] of rowsBySku) {
      const sample = groupRows[0];
      const existingRes = await client.query("select id from products where sku = $1 limit 1", [sku]);
      const existed = existingRes.rows.length > 0;
      const productId = await ensureStandardProduct(
        client,
        sku,
        cell(sample.input_product_name),
        cell(sample.adjusted_invoice_name),
        cell(sample.retail_name),
        cell(sample.unit),
        cell(sample.unit_price)
      );
      if (!productId) continue;

      const productRes = await client.query("select id, name, sku, unit, price from products where id = $1 limit 1", [productId]);
      const product = productRes.rows[0];
      const totalQty = groupRows.reduce((sum, row) => sum + rowQuantity(row), 0);
      if (totalQty <= 0) continue;

      let variantId: string;
      const variantRes = await client.query(
        "select id from product_variants where product_id = $1 order by position asc limit 1",
        [productId]
      );
      if (variantRes.rows.length > 0) {
        variantId = variantRes.rows[0].id;
      } else {
        const newVariant = await client.query(
          `
            insert into product_variants (product_id, title, sku, price, cost_price, position, created_at, updated_at)
            values ($1, 'Mặc định', $2, $3, $4, 1, now(), now())
            returning id
          `,
          [productId, sku, product.price ?? 0, parseNumeric(sample.unit_price) ?? 0]
        );
        variantId = newVariant.rows[0].id;
      }

      let locationId: string;
      const locationRes = await client.query("select id from locations order by is_default desc, created_at asc limit 1");
      if (locationRes.rows.length > 0) {
        locationId = locationRes.rows[0].id;
      } else {
        const newLocation = await client.query(
          `
            insert into locations (name, is_default, is_active, created_at, updated_at)
            values ('Cửa hàng chính', true, true, now(), now())
            returning id
          `
        );
        locationId = newLocation.rows[0].id;
      }

      await client.query(
        `
          insert into inventory_levels (variant_id, location_id, quantity, updated_at)
          values ($1, $2, $3, now())
          on conflict (variant_id, location_id)
          do update set
            quantity = inventory_levels.quantity + excluded.quantity,
            updated_at = now()
        `,
        [variantId, locationId, totalQty]
      );

      const groupIds = groupRows.map((row) => row.id);
      await client.query(
        `
          update invoice_rows
          set synced_product_id = $1,
              product_synced_at = now(),
              inventory_added_quantity = quantity,
              updated_at = now()
          where id = any($2::text[])
            and product_synced_at is null
        `,
        [productId, groupIds]
      );

      await client.query(
        `
          insert into product_catalog
            (sku, input_name, invoice_name, retail_name, unit, sale_price, product_id, updated_at)
          values ($1, $2, $3, $4, $5, 0, $6, now())
          on conflict (sku)
          do update set
            input_name = coalesce(nullif(excluded.input_name, ''), product_catalog.input_name),
            invoice_name = coalesce(nullif(excluded.invoice_name, ''), product_catalog.invoice_name),
            retail_name = coalesce(nullif(excluded.retail_name, ''), product_catalog.retail_name),
            unit = coalesce(nullif(excluded.unit, ''), product_catalog.unit),
            product_id = excluded.product_id,
            updated_at = now()
        `,
        [
          sku,
          cell(sample.input_product_name),
          cell(sample.adjusted_invoice_name),
          cell(sample.retail_name),
          cell(sample.unit),
          productId
        ]
      );

      result.syncedRowCount += groupRows.length;
      result.totalQuantity += totalQty;
      if (existed) result.updatedProductCount += 1;
      else result.createdProductCount += 1;
    }

    await client.query("commit");
    await logActivity("product", `Đưa ${result.syncedRowCount} dòng hóa đơn vào sản phẩm/kho`);
    return { store: await readStore(), result };
  } catch (error) {
    await client.query("rollback");
    console.error("Failed to add invoice rows to inventory:", error);
    throw error;
  } finally {
    client.release();
  }
}
