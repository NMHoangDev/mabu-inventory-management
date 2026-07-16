// Ghi log append-only mỗi lần products.stock thay đổi — nguồn dữ liệu cho
// tab "Lịch sử kho" ở trang chi tiết sản phẩm (app/(dashboard)/products/inventory/[id]).
// Dùng chung bởi lib/orders/repository.ts, lib/inventory/receipts.ts,
// lib/goods-receipts/repository.ts, lib/stock-checks/repository.ts — mỗi nơi
// trực tiếp UPDATE products.stock đều gọi recordStockMovement() ngay sau đó,
// trong cùng transaction/client đang mở để đảm bảo tính atomic.

export type StockMovementType =
  | "initial"
  | "order_sale"
  | "order_restore"
  | "goods_receipt"
  | "goods_receipt_reverse"
  | "stock_check"
  | "stock_receipt";

export interface RecordStockMovementInput {
  productId: string;
  movementType: StockMovementType;
  quantityChange: number;
  resultingStock: number;
  referenceTable?: string;
  referenceId?: string | null;
  referenceCode?: string;
  customerName?: string;
  staff?: string;
  branch?: string;
  note?: string;
}

export async function recordStockMovement(client: any, input: RecordStockMovementInput): Promise<void> {
  await client.query(
    `insert into stock_movements (
      product_id, movement_type, quantity_change, resulting_stock,
      reference_table, reference_id, reference_code, customer_name, staff, branch, note
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.productId,
      input.movementType,
      input.quantityChange,
      input.resultingStock,
      input.referenceTable ?? null,
      input.referenceId ?? null,
      input.referenceCode ?? null,
      input.customerName ?? null,
      input.staff ?? null,
      input.branch ?? null,
      input.note ?? null,
    ]
  );
}
