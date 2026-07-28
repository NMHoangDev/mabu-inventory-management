import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";
import { createOrder, type OrderInput } from "@/lib/orders/repository";
import { loadWorkbookSheet, rowsToObjects } from "@/lib/imports/xlsx-helpers";
import { ORDER_IMPORT_HEADER_MAP } from "@/lib/orders/import-fields";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RawRow {
  rowNumber: number;
  temp_code: string;
  customer_name: string;
  customer_phone: string;
  product_sku: string;
  quantity: string;
  unit_price: string;
  item_note: string;
  order_note: string;
  discount: string;
  shipping_fee: string;
  source: string;
}

interface ResolvedItem {
  rowNumber: number;
  product_sku: string;
  product_id: string | null;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  item_note: string;
  error?: string;
}

interface OrderGroup {
  tempCode: string;
  rowNumbers: number[];
  customer_name: string;
  customer_phone: string;
  order_note: string;
  discount: number;
  shipping_fee: number;
  source: string;
  items: ResolvedItem[];
  groupError?: string;
}

function parseNum(text: string): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[^\d.-]/g, "");
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

async function parseAndGroup(buffer: Buffer): Promise<{ groups: OrderGroup[]; skus: string[] }> {
  const sheet = await loadWorkbookSheet(buffer);
  const raw = rowsToObjects(sheet, ORDER_IMPORT_HEADER_MAP);

  const groups: OrderGroup[] = [];
  const groupByCode = new Map<string, OrderGroup>();
  const skuSet = new Set<string>();

  for (const { rowNumber, values } of raw) {
    const tempCode = (values.temp_code ?? "").trim();
    const sku = (values.product_sku ?? "").trim();
    if (sku) skuSet.add(sku);

    let group: OrderGroup;
    if (tempCode && groupByCode.has(tempCode)) {
      group = groupByCode.get(tempCode)!;
      group.rowNumbers.push(rowNumber);
    } else {
      group = {
        tempCode: tempCode || `#${rowNumber}`,
        rowNumbers: [rowNumber],
        customer_name: (values.customer_name ?? "").trim(),
        customer_phone: (values.customer_phone ?? "").trim(),
        order_note: (values.order_note ?? "").trim(),
        discount: parseNum(values.discount ?? "") || 0,
        shipping_fee: parseNum(values.shipping_fee ?? "") || 0,
        source: (values.source ?? "").trim() || "store",
        items: []
      };
      groups.push(group);
      if (tempCode) groupByCode.set(tempCode, group);
    }

    const quantity = parseNum(values.quantity ?? "");
    const unitPriceRaw = parseNum(values.unit_price ?? "");
    let itemError: string | undefined;
    if (!sku) itemError = "Thiếu SKU sản phẩm.";
    else if (quantity === undefined || Number.isNaN(quantity) || quantity <= 0) itemError = "Số lượng không hợp lệ.";
    else if (unitPriceRaw !== undefined && (Number.isNaN(unitPriceRaw) || unitPriceRaw < 0)) itemError = "Đơn giá không hợp lệ.";

    group.items.push({
      rowNumber,
      product_sku: sku,
      product_id: null,
      product_name: "",
      unit: "",
      quantity: quantity ?? 0,
      unit_price: unitPriceRaw ?? 0,
      item_note: (values.item_note ?? "").trim(),
      error: itemError
    });
  }

  return { groups, skus: Array.from(skuSet) };
}

async function resolveProducts(groups: OrderGroup[], skus: string[]) {
  if (!isDatabaseConfigured || skus.length === 0) return;
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(
    `select id, sku, name, unit, price from products where lower(sku) = any($1::text[])`,
    [skus.map((s) => s.toLowerCase())]
  );
  const bySkuLower = new Map(res.rows.map((r) => [String(r.sku).toLowerCase(), r]));

  for (const group of groups) {
    if (!group.customer_name) {
      group.groupError = "Thiếu tên khách hàng.";
    }
    for (const item of group.items) {
      if (item.error) continue;
      const match = bySkuLower.get(item.product_sku.toLowerCase());
      if (!match) {
        item.error = `Không tìm thấy SKU "${item.product_sku}".`;
        continue;
      }
      item.product_id = match.id;
      item.product_name = match.name;
      item.unit = match.unit ?? "";
      if (!item.unit_price) item.unit_price = Number(match.price ?? 0);
    }
    if (group.items.every((i) => i.error)) {
      group.groupError = group.groupError ?? "Không có sản phẩm hợp lệ nào trong đơn.";
    }
  }
}

export async function POST(request: Request) {
  const guard = await requirePermission("orders.import");
  if (guard) return guard;
  try {
    const form = await request.formData();
    const mode = String(form.get("mode") ?? "parse");
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const { groups, skus } = await parseAndGroup(buffer);
    await resolveProducts(groups, skus);

    if (mode === "parse") {
      const orders = groups.map((g) => {
        const validItems = g.items.filter((i) => !i.error);
        const subtotal = validItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
        const errors = [
          ...(g.groupError ? [g.groupError] : []),
          ...g.items.filter((i) => i.error).map((i) => `Dòng ${i.rowNumber}: ${i.error}`)
        ];
        return {
          rowNumber: g.rowNumbers[0],
          tempCode: g.tempCode,
          customer_name: g.customer_name,
          itemCount: validItems.length,
          subtotal,
          errors: errors.length > 0 ? errors : undefined
        };
      });
      const toCreate = orders.filter((o) => !o.errors && o.itemCount > 0).length;
      const errorCount = orders.filter((o) => o.errors).length;
      return NextResponse.json({
        orders,
        summary: { toCreate, errorCount, totalRows: groups.reduce((s, g) => s + g.items.length, 0) }
      });
    }

    if (mode === "commit") {
      const created: { order_code: string; order_id: string }[] = [];
      const errors: { rowNumber?: number; message: string }[] = [];

      for (const group of groups) {
        const validItems = group.items.filter((i) => !i.error);
        if (group.groupError || validItems.length === 0) {
          errors.push({
            rowNumber: group.rowNumbers[0],
            message: group.groupError ?? "Không có sản phẩm hợp lệ nào trong đơn."
          });
          continue;
        }
        const orderInput: OrderInput = {
          customer_name: group.customer_name,
          customer_phone: group.customer_phone,
          status: "new",
          payment_status: "unpaid",
          fulfillment_status: "unshipped",
          source: (["store", "facebook", "website", "zalo", "other"].includes(group.source)
            ? group.source
            : "other") as OrderInput["source"],
          note: [group.order_note, "[IMPORT-EXCEL]"].filter(Boolean).join(" | "),
          discount: group.discount,
          shipping_fee: group.shipping_fee,
          paid: 0,
          items: validItems.map((i) => ({
            product_id: i.product_id,
            product_name: i.product_name,
            product_sku: i.product_sku,
            unit: i.unit,
            quantity: i.quantity,
            unit_price: i.unit_price,
            note: i.item_note
          }))
        };
        try {
          const order = await createOrder(orderInput);
          created.push({ order_code: order.code, order_id: order.id });
        } catch (err) {
          errors.push({
            rowNumber: group.rowNumbers[0],
            message: err instanceof Error ? err.message : "Không tạo được đơn."
          });
        }
      }
      return NextResponse.json({ created, errors });
    }

    return NextResponse.json({ error: "mode không hợp lệ." }, { status: 400 });
  } catch (error) {
    console.error("Orders import API failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không nhập được dữ liệu." },
      { status: 500 }
    );
  }
}
