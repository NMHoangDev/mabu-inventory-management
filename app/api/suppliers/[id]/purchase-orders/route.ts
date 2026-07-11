import { NextResponse } from "next/server";
import { isDatabaseConfigured, getPool } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// GET /api/suppliers/[id]/purchase-orders
// Trả về đơn đặt hàng nhập + phiếu nhập kho của nhà cung cấp này, kèm tên
// file hóa đơn scan gốc (nếu đơn được tạo từ luồng scan) để trang chi tiết
// NCC hiển thị + link thẳng tới trang chi tiết từng đơn.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!isDatabaseConfigured || !isUuid(id)) {
      return NextResponse.json({ purchase_orders: [], goods_receipts: [] });
    }
    await ensureDatabase();
    const pool = getPool();

    const [poRes, grRes] = await Promise.all([
      pool.query(
        `select po.id, po.code, po.status, po.total, po.created_at,
                po.invoice_document_id, doc.file_name as invoice_file_name
           from purchase_orders po
           left join invoice_documents doc on doc.id = po.invoice_document_id
          where po.supplier_id = $1::uuid
          order by po.created_at desc
          limit 100`,
        [id]
      ),
      pool.query(
        `select gr.id, gr.code, gr.receipt_status, gr.order_status, gr.total_cost, gr.received_at,
                gr.purchase_order_id, po.invoice_document_id, doc.file_name as invoice_file_name
           from goods_receipts gr
           left join purchase_orders po on po.id = gr.purchase_order_id
           left join invoice_documents doc on doc.id = po.invoice_document_id
          where gr.supplier_id = $1::uuid
          order by gr.received_at desc
          limit 100`,
        [id]
      )
    ]);

    return NextResponse.json({
      purchase_orders: poRes.rows,
      goods_receipts: grRes.rows
    });
  } catch (error) {
    console.error("GET /api/suppliers/[id]/purchase-orders failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được đơn nhập hàng." },
      { status: 500 }
    );
  }
}
