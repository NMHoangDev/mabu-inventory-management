import { NextResponse } from "next/server";
import { z } from "zod";
import { listOrders, listOrdersForExport, type Order, type OrderListFilters } from "@/lib/orders/repository";
import { buildWorkbookBuffer, xlsxResponse, timestampedFilename } from "@/lib/shared/excel-export";
import { ORDER_EXPORT_COLUMNS } from "@/lib/orders/export-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filtersSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  payment_status: z.string().optional(),
  fulfillment_status: z.string().optional(),
  source: z.string().optional(),
  customer_id: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  page: z.number().optional(),
  page_size: z.number().optional()
});

const bodySchema = z.object({
  scope: z.enum(["all", "current_page"]),
  filters: filtersSchema,
  exportType: z.enum(["order_summary", "product_summary", "detail"]),
  fields: z.array(z.string()).min(1)
});

function orderToSummaryRow(order: Order): Record<string, unknown> {
  return {
    code: order.code,
    created_at: order.created_at,
    updated_at: order.updated_at,
    status: order.status,
    payment_status: order.payment_status,
    fulfillment_status: order.fulfillment_status,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    note: order.note,
    branch: order.branch,
    staff: order.staff,
    source: order.source,
    payment_method: order.payment_method,
    subtotal: order.subtotal,
    discount: order.discount,
    discount_type: order.discount_type,
    shipping_fee: order.shipping_fee,
    total: order.total,
    paid: order.paid
  };
}

function orderToItemRows(order: Order): Record<string, unknown>[] {
  const base = orderToSummaryRow(order);
  if (order.items.length === 0) return [{ ...base }];
  return order.items.map((item) => ({
    ...base,
    product_sku: item.product_sku,
    product_name: item.product_name,
    unit: item.unit,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount_type_item: item.discount_type,
    discount_value: item.discount_value,
    line_total: item.line_total,
    item_note: item.note
  }));
}

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { scope, filters, exportType, fields } = parsed.data;

    const orders =
      scope === "all"
        ? await listOrdersForExport(filters as OrderListFilters)
        : (await listOrders(filters as OrderListFilters)).orders;

    const rows = exportType === "order_summary" ? orders.map(orderToSummaryRow) : orders.flatMap(orderToItemRows);

    const columns = fields.map((key) => ORDER_EXPORT_COLUMNS[key]).filter(Boolean);
    if (columns.length === 0) {
      return NextResponse.json({ error: "Chưa chọn trường nào để xuất." }, { status: 400 });
    }

    const buffer = await buildWorkbookBuffer("Don hang", columns, rows);
    return xlsxResponse(buffer, timestampedFilename("don-hang"));
  } catch (error) {
    console.error("Orders export API failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không xuất được file." },
      { status: 500 }
    );
  }
}
