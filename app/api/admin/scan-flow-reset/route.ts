import { NextResponse } from "next/server";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin endpoint to reset data from the SCAN flow.
 *
 * Body: { mode: "preview" | "backup" | "cleanup", confirmBackupId?: string }
 *
 * - preview  : count rows that would be touched (no writes)
 * - backup   : write JSON snapshot to /backups/scan-flow-<timestamp>.json
 * - cleanup  : delete rows in a single transaction. Requires confirmBackupId
 *              matching the latest backup filename (without extension).
 *
 * The endpoint only touches rows created by the SCAN flow:
 *   - invoice_documents, invoice_rows
 *   - purchase_orders WHERE invoice_document_id IS NOT NULL
 *   - purchase_order_items linked to those POs
 *   - goods_receipts linked to those POs (and goods_receipt_items)
 *   - invoice_rows.purchase_order_id / goods_receipt_id pointers are reset
 *
 * Stock counter-effects:
 *   For goods_receipts whose items were already added to product.stock
 *   (stock_added_at IS NOT NULL), we DECREMENT product.stock by the same
 *   quantity so the user can re-test cleanly.
 *
 * Auth: requires header `x-admin-token` matching env `ADMIN_RESET_TOKEN`
 *       (falls back to a constant if env is missing — only for local dev).
 */

const schema = z.object({
  mode: z.enum(["preview", "backup", "cleanup"]),
  confirmBackupId: z.string().optional()
});

const LOCAL_DEV_TOKEN = "dev-reset-token";

const BACKUPS_DIR = path.join(process.cwd(), "backups");

interface Counts {
  invoiceDocuments: number;
  invoiceRows: number;
  purchaseOrders: number;
  purchaseOrderItems: number;
  goodsReceipts: number;
  goodsReceiptItems: number;
  stockAdjustments: number;
}

interface ScanSnapshot {
  capturedAt: string;
  counts: Counts;
  invoiceDocuments: any[];
  invoiceRows: any[];
  purchaseOrders: any[];
  purchaseOrderItems: any[];
  goodsReceipts: any[];
  goodsReceiptItems: any[];
  stockDeltas: Array<{ product_id: string; quantity: number }>;
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function authorized(request: Request): boolean {
  const token = request.headers.get("x-admin-token") ?? "";
  const expected = process.env.ADMIN_RESET_TOKEN ?? LOCAL_DEV_TOKEN;
  return token === expected;
}

async function gatherSnapshot(client: any): Promise<ScanSnapshot> {
  // 1) Pull all scan-origin invoice_documents
  const docsRes = await client.query(
    `select * from invoice_documents order by uploaded_at asc`
  );
  const docIds = docsRes.rows.map((r: any) => String(r.id));

  // 2) Pull all invoice_rows
  const rowsRes = docIds.length
    ? await client.query(
        `select * from invoice_rows where document_id = any($1::text[])
         order by created_at asc`,
        [docIds]
      )
    : { rows: [] };

  // 3) Pull PO + items tied to those docs
  const poRes = docIds.length
    ? await client.query(
        `select * from purchase_orders
          where invoice_document_id = any($1::text[])
          order by created_at asc`,
        [docIds]
      )
    : { rows: [] };
  const poIds = poRes.rows.map((r: any) => String(r.id));
  const poiRes = poIds.length
    ? await client.query(
        `select * from purchase_order_items where purchase_order_id = any($1::uuid[])
         order by created_at asc`,
        [poIds]
      )
    : { rows: [] };

  // 4) Pull GR + items tied to those POs
  const grRes = poIds.length
    ? await client.query(
        `select * from goods_receipts where purchase_order_id = any($1::uuid[])
          order by created_at asc`,
        [poIds]
      )
    : { rows: [] };
  const grIds = grRes.rows.map((r: any) => String(r.id));
  const griRes = grIds.length
    ? await client.query(
        `select * from goods_receipt_items where goods_receipt_id = any($1::uuid[])
          order by created_at asc`,
        [grIds]
      )
    : { rows: [] };

  // 5) Compute stock deltas — only items where stock_added_at IS NOT NULL
  //    (those contributed to current product.stock and must be reversed)
  const stockRes = griRes.rows.length
    ? await client.query(
        `select product_id::text, sum(received_qty)::numeric as qty
           from goods_receipt_items
          where goods_receipt_id = any($1::uuid[])
            and stock_added_at is not null
            and product_id is not null
          group by product_id`,
        [grIds]
      )
    : { rows: [] };

  return {
    capturedAt: new Date().toISOString(),
    counts: {
      invoiceDocuments: docsRes.rows.length,
      invoiceRows: rowsRes.rows.length,
      purchaseOrders: poRes.rows.length,
      purchaseOrderItems: poiRes.rows.length,
      goodsReceipts: grRes.rows.length,
      goodsReceiptItems: griRes.rows.length,
      stockAdjustments: stockRes.rows.length
    },
    invoiceDocuments: docsRes.rows,
    invoiceRows: rowsRes.rows,
    purchaseOrders: poRes.rows,
    purchaseOrderItems: poiRes.rows,
    goodsReceipts: grRes.rows,
    goodsReceiptItems: griRes.rows,
    stockDeltas: stockRes.rows.map((r: any) => ({
      product_id: String(r.product_id),
      quantity: Number(r.qty ?? 0)
    }))
  };
}

async function writeBackup(snapshot: ScanSnapshot): Promise<string> {
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
  const id = `scan-flow-${formatTimestamp(new Date())}`;
  const filename = `${id}.json`;
  const filePath = path.join(BACKUPS_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf8");
  return id;
}

async function findLatestBackupId(): Promise<string | null> {
  try {
    const files = await fs.readdir(BACKUPS_DIR);
    const backups = files
      .filter((f) => f.startsWith("scan-flow-") && f.endsWith(".json"))
      .sort();
    if (backups.length === 0) return null;
    return backups[backups.length - 1].replace(/\.json$/, "");
  } catch {
    return null;
  }
}

async function applyCleanup(client: any, snapshot: ScanSnapshot): Promise<{
  deleted: Counts;
  stockDecrements: number;
}> {
  const docIds = snapshot.invoiceDocuments.map((r: any) => String(r.id));
  const poIds = snapshot.purchaseOrders.map((r: any) => String(r.id));
  const grIds = snapshot.goodsReceipts.map((r: any) => String(r.id));

  // Reverse stock first (we still have product ids; goods_receipt_items
  // rows still exist). Use GREATEST(0, ...) so we never go negative even
  // if another flow already touched the same product.
  let stockDecrements = 0;
  for (const delta of snapshot.stockDeltas) {
    if (!delta.product_id || !Number.isFinite(delta.quantity) || delta.quantity <= 0) continue;
    await client.query(
      `update products
          set stock = greatest(0, coalesce(stock, 0) - $2),
              stock_updated_at = now()
        where id = $1`,
      [delta.product_id, delta.quantity]
    );
    stockDecrements += 1;
  }

  // Clear stock_added_at so any remaining references are consistent.
  if (grIds.length > 0) {
    await client.query(
      `update goods_receipt_items set stock_added_at = null
        where goods_receipt_id = any($1::uuid[])`,
      [grIds]
    );
  }

  // Delete leaves first: invoice_rows pointers, then goods_receipt_items,
  // goods_receipts, purchase_order_items, purchase_orders, invoice_rows,
  // invoice_documents.
  //
  // ON DELETE CASCADE already handles most children (invoice_rows -> invoice_documents,
  // goods_receipt_items -> goods_receipts, purchase_order_items -> purchase_orders),
  // but we still need to delete the parent tables in the right order so that
  // dangling FK constraints don't bite. We do it explicitly so the counts
  // we return match the snapshot exactly.

  const deleted: Counts = {
    invoiceDocuments: 0,
    invoiceRows: 0,
    purchaseOrders: 0,
    purchaseOrderItems: 0,
    goodsReceipts: 0,
    goodsReceiptItems: 0,
    stockAdjustments: 0
  };

  if (grIds.length > 0) {
    const r = await client.query(
      `delete from goods_receipts where id = any($1::uuid[])`,
      [grIds]
    );
    deleted.goodsReceipts = r.rowCount ?? grIds.length;
  }
  if (poIds.length > 0) {
    const r = await client.query(
      `delete from purchase_orders where id = any($1::uuid[])`,
      [POIdsSafe(poIds)]
    );
    deleted.purchaseOrders = r.rowCount ?? poIds.length;
  }
  if (docIds.length > 0) {
    const r = await client.query(
      `delete from invoice_documents where id = any($1::text[])`,
      [docIds]
    );
    deleted.invoiceDocuments = r.rowCount ?? docIds.length;
  }

  // Count cascade-deleted children for the response
  if (docIds.length > 0) {
    const r = await client.query(
      `select count(*)::int as c from invoice_rows where document_id = any($1::text[])`,
      [docIds]
    );
    deleted.invoiceRows = Number(r.rows[0]?.c ?? 0);
  }
  if (POIdsSafe(poIds).length > 0) {
    const r = await client.query(
      `select count(*)::int as c from purchase_order_items where purchase_order_id = any($1::uuid[])`,
      [POIdsSafe(poIds)]
    );
    deleted.purchaseOrderItems = Number(r.rows[0]?.c ?? 0);
  }
  if (grIds.length > 0) {
    const r = await client.query(
      `select count(*)::int as c from goods_receipt_items where goods_receipt_id = any($1::uuid[])`,
      [grIds]
    );
    deleted.goodsReceiptItems = Number(r.rows[0]?.c ?? 0);
  }
  deleted.stockAdjustments = stockDecrements;

  return { deleted, stockDecrements };
}

function POIdsSafe(ids: string[]): string[] {
  // cast safety: ensure values look like UUIDs; if not, pg would throw.
  return ids.filter((id) => /^[0-9a-f-]{32,36}$/i.test(id));
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized. Cần gửi header `x-admin-token` đúng." },
      { status: 401 }
    );
  }
  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: "Database chưa cấu hình." }, { status: 500 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Body không hợp lệ. Cần { mode: 'preview'|'backup'|'cleanup' }" },
      { status: 400 }
    );
  }

  await ensureDatabase();
  const pool = getPool();

  if (body.mode === "preview") {
    const client = await pool.connect();
    try {
      const snapshot = await gatherSnapshot(client);
      return NextResponse.json({
        mode: "preview",
        counts: snapshot.counts,
        stockDeltas: snapshot.stockDeltas
      });
    } finally {
      client.release();
    }
  }

  if (body.mode === "backup") {
    const client = await pool.connect();
    try {
      const snapshot = await gatherSnapshot(client);
      const id = await writeBackup(snapshot);
      return NextResponse.json({
        mode: "backup",
        backupId: id,
        counts: snapshot.counts,
        stockDeltas: snapshot.stockDeltas,
        message: `Đã backup vào backups/${id}.json. Gửi lại body với mode=cleanup và confirmBackupId="${id}" để xóa.`
      });
    } finally {
      client.release();
    }
  }

  // cleanup
  const latestId = await findLatestBackupId();
  if (!body.confirmBackupId) {
    return NextResponse.json(
      {
        error: `Thiếu confirmBackupId. Backup mới nhất hiện tại: ${latestId ?? "(chưa có)"}. Hãy chạy backup trước.`
      },
      { status: 400 }
    );
  }
  if (latestId && body.confirmBackupId !== latestId) {
    return NextResponse.json(
      {
        error: `confirmBackupId không khớp backup mới nhất. Đã có backup mới hơn: ${latestId}. Hãy backup lại hoặc dùng đúng id này.`
      },
      { status: 400 }
    );
  }
  // Verify backup file actually exists
  const backupPath = path.join(BACKUPS_DIR, `${body.confirmBackupId}.json`);
  try {
    await fs.access(backupPath);
  } catch {
    return NextResponse.json(
      { error: `Không tìm thấy file backup: ${body.confirmBackupId}.json` },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const snapshot = await gatherSnapshot(client);
    const result = await applyCleanup(client, snapshot);
    await client.query("commit");
    return NextResponse.json({
      mode: "cleanup",
      backupId: body.confirmBackupId,
      deleted: result.deleted,
      stockDecrements: result.stockDecrements,
      message: `Đã xóa dữ liệu flow scan theo backup ${body.confirmBackupId}.json. Tồn kho đã được hoàn lại.`
    });
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    console.error("scan-flow-reset cleanup failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lỗi cleanup." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}