import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateRow {
  sku?: string;
  product_name?: string;
  unit?: string;
  actual_quantity?: number;
  cost_price?: number;
}

interface CostPriceUpdateRow {
  product_id?: string;
  cost_price?: number;
}

interface CreatedRow {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  actual_quantity: number;
}

/**
 * Xử lý 2 việc phát sinh từ file "Báo cáo tồn kho" nhập vào — CHỈ chạy khi
 * người dùng thực sự bấm "Tạo phiếu kiểm"/"Cân bằng kho" ở trang tạo phiếu
 * kiểm (không tự chạy ngay lúc upload/preview file):
 *
 *   1) `rows` — tạo sản phẩm mới cho SKU trong file nhưng chưa có trong hệ
 *      thống. Tạo với stock=0 (tồn kho thật lấy từ file sẽ áp vào ngay sau
 *      qua flow phiếu kiểm hàng thông thường — variance = actual - 0, có
 *      ghi stock_movements đầy đủ), cost_price lấy luôn từ cột "Giá vốn"
 *      trong file nếu có.
 *   2) `costPriceUpdates` — với SKU ĐÃ có sản phẩm nhưng giá vốn trong file
 *      khác giá vốn hệ thống, cập nhật thẳng products.cost_price theo file
 *      (không có "phiếu" riêng cho giá vốn như tồn kho — ghi đè trực tiếp).
 *
 * PERF: trước đây gọi createProduct() từng dòng (mỗi lần tự mở 1 connection
 * + 1 transaction riêng: insert products/insert variant/insert catalog) —
 * với file vài trăm SKU mới, đây là hàng nghìn round-trip tuần tự tới
 * Supabase. Giờ bulk cả 4 việc trong 1 transaction, đúng ~5 câu bất kể N.
 */
export async function POST(request: Request) {
  const guard = await requirePermission("stock_checks.create");
  if (guard) return guard;

  try {
    const body = await request.json().catch(() => ({}));
    const rawRows: CreateRow[] = Array.isArray(body?.rows) ? body.rows : [];
    const rawCostPriceUpdates: CostPriceUpdateRow[] = Array.isArray(body?.costPriceUpdates)
      ? body.costPriceUpdates
      : [];

    const errors: Array<{ sku: string; message: string }> = [];
    // Dedupe theo SKU (không phân biệt hoa/thường) — bulk insert dùng
    // ON CONFLICT DO NOTHING, mà Postgres không cho phép cùng 1 câu insert
    // đụng cùng 1 dòng conflict 2 lần ("cannot affect row a second time"),
    // nên 2 dòng trùng SKU trong input sẽ làm lỗi cả batch nếu không gộp.
    const bySkuLower = new Map<
      string,
      { sku: string; name: string; unit: string; actual_quantity: number; cost_price: number }
    >();
    for (const row of rawRows) {
      const sku = String(row?.sku ?? "").trim();
      const name = String(row?.product_name ?? "").trim();
      if (!sku || !name) {
        errors.push({ sku, message: "Thiếu SKU hoặc tên sản phẩm." });
        continue;
      }
      bySkuLower.set(sku.toLowerCase(), {
        sku,
        name,
        unit: String(row.unit ?? "").trim(),
        actual_quantity: Number(row.actual_quantity) || 0,
        cost_price: Number(row.cost_price) || 0
      });
    }
    const rows = Array.from(bySkuLower.values());

    // Dedupe theo product_id cho cost price updates (đề phòng 1 SKU xuất
    // hiện 2 lần trong danh sách gửi lên — dòng sau đè dòng trước).
    const costPriceByProductId = new Map<string, number>();
    for (const row of rawCostPriceUpdates) {
      const productId = String(row?.product_id ?? "").trim();
      const costPrice = Number(row?.cost_price);
      if (!productId || !Number.isFinite(costPrice) || costPrice <= 0) continue;
      costPriceByProductId.set(productId, costPrice);
    }

    if (rows.length === 0 && costPriceByProductId.size === 0) {
      return NextResponse.json({ created: [], costPriceUpdated: [], errors });
    }
    if (!isDatabaseConfigured) {
      return NextResponse.json({ error: "Database chưa được cấu hình (thiếu DATABASE_URL)." }, { status: 500 });
    }
    await ensureDatabase();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("begin");

      const names = rows.map((r) => r.name);
      const skus = rows.map((r) => r.sku);
      const units = rows.map((r) => r.unit);
      const costPrices = rows.map((r) => r.cost_price);

      // ON CONFLICT DO NOTHING: nếu 1 SKU vừa được tạo bởi request khác
      // giữa lúc preview và lúc bấm lưu (race hiếm), dòng đó chỉ bị bỏ qua
      // (báo lỗi riêng cho SKU đó) thay vì rollback cả batch.
      const inserted =
        rows.length > 0
          ? await client.query(
              `insert into products (name, sku, unit, cost_price, status)
               select t.name, t.sku, t.unit, t.cost_price, 'active'
               from unnest($1::text[], $2::text[], $3::text[], $4::numeric[]) as t(name, sku, unit, cost_price)
               on conflict (sku) do nothing
               returning id, sku, name, unit`,
              [names, skus, units, costPrices]
            )
          : { rows: [] as Array<{ id: string; sku: string; name: string; unit: string }> };

      const createdBySkuLower = new Map<string, { id: string; sku: string; name: string; unit: string }>();
      for (const r of inserted.rows) {
        createdBySkuLower.set(String(r.sku).toLowerCase(), r);
      }
      for (const r of rows) {
        if (!createdBySkuLower.has(r.sku.toLowerCase())) {
          errors.push({ sku: r.sku, message: "SKU đã tồn tại (có thể vừa được tạo bởi 1 yêu cầu khác)." });
        }
      }

      const createdIds: string[] = inserted.rows.map((r) => r.id);
      const createdSkus: string[] = inserted.rows.map((r) => r.sku);
      const createdNames: string[] = inserted.rows.map((r) => r.name);
      const createdUnits: string[] = inserted.rows.map((r) => r.unit);
      const createdCostPrices: number[] = inserted.rows.map(
        (r) => bySkuLower.get(String(r.sku).toLowerCase())?.cost_price ?? 0
      );

      if (createdIds.length > 0) {
        // Biến thể mặc định — cùng cấu trúc với createProduct() (title
        // "Mặc định", sku = sku sản phẩm), chỉ khác là bulk cho cả batch.
        await client.query(
          `insert into product_variants (product_id, title, sku, price, cost_price, position)
           select t.id, 'Mặc định', t.sku, 0, t.cost_price, 1
           from unnest($1::uuid[], $2::text[], $3::numeric[]) as t(id, sku, cost_price)`,
          [createdIds, createdSkus, createdCostPrices]
        );

        await client.query(
          `insert into product_catalog (sku, input_name, retail_name, unit, product_id)
           select t.sku, t.name, t.name, t.unit, t.id
           from unnest($1::text[], $2::text[], $3::text[], $4::uuid[]) as t(sku, name, unit, id)
           on conflict (sku) do update set
             input_name = excluded.input_name,
             retail_name = excluded.retail_name,
             unit = excluded.unit,
             product_id = excluded.product_id,
             updated_at = now()`,
          [createdSkus, createdNames, createdUnits, createdIds]
        );
      }

      let costPriceUpdated: Array<{ product_id: string; cost_price: number }> = [];
      if (costPriceByProductId.size > 0) {
        const updateIds = Array.from(costPriceByProductId.keys());
        const updateCostPrices = updateIds.map((id) => costPriceByProductId.get(id)!);
        const updatedRes = await client.query(
          `update products p
              set cost_price = v.cost_price,
                  updated_at = now()
             from unnest($1::uuid[], $2::numeric[]) as v(id, cost_price)
            where p.id = v.id
            returning p.id, p.cost_price`,
          [updateIds, updateCostPrices]
        );
        // Đồng bộ luôn cost_price của variant mặc định — vài chỗ khác (vd
        // đơn hàng) có thể đọc giá vốn từ product_variants.
        await client.query(
          `update product_variants pv
              set cost_price = v.cost_price,
                  updated_at = now()
             from unnest($1::uuid[], $2::numeric[]) as v(product_id, cost_price)
            where pv.product_id = v.product_id`,
          [updateIds, updateCostPrices]
        );
        costPriceUpdated = updatedRes.rows.map((r) => ({
          product_id: String(r.id),
          cost_price: Number(r.cost_price)
        }));
      }

      await client.query("commit");

      const actualQtyBySkuLower = new Map(rows.map((r) => [r.sku.toLowerCase(), r.actual_quantity]));
      const created: CreatedRow[] = inserted.rows.map((r) => ({
        product_id: r.id,
        sku: r.sku,
        product_name: r.name,
        unit: r.unit || "",
        actual_quantity: actualQtyBySkuLower.get(String(r.sku).toLowerCase()) ?? 0
      }));

      return NextResponse.json({ created, costPriceUpdated, errors });
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không xử lý được yêu cầu." },
      { status: 500 }
    );
  }
}
