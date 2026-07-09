import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool, isDatabaseConfigured } from "@/lib/db/connection";
import { ensureDatabase } from "@/lib/db/migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isDatabaseConfigured) return NextResponse.json({ images: [] });
    await ensureDatabase();
    const { id } = await context.params;
    const pool = getPool();
    const res = await pool.query(
      `select id, url, coalesce(alt, '') as alt, position from product_images where product_id = $1 order by position asc`,
      [id]
    );
    return NextResponse.json({ images: res.rows });
  } catch (error) {
    console.error("GET /api/products/[id]/images failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load images." },
      { status: 500 }
    );
  }
}

const schema = z.object({
  images: z.array(z.object({ url: z.string().min(1), alt: z.string().optional() })),
});

// Thay toàn bộ danh sách ảnh (giống pattern customer_addresses ở
// lib/customers/repository.ts) — đơn giản hơn CRUD từng ảnh vì UI chỉ cần 1
// danh sách url + thứ tự, không có ảnh nào có state riêng cần giữ.
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    await ensureDatabase();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`delete from product_images where product_id = $1`, [id]);
      let position = 1;
      for (const img of parsed.data.images) {
        await client.query(
          `insert into product_images (product_id, url, alt, position, created_at) values ($1, $2, $3, $4, now())`,
          [id, img.url, img.alt ?? "", position++]
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    const res = await pool.query(
      `select id, url, coalesce(alt, '') as alt, position from product_images where product_id = $1 order by position asc`,
      [id]
    );
    return NextResponse.json({ images: res.rows });
  } catch (error) {
    console.error("PUT /api/products/[id]/images failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save images." },
      { status: 500 }
    );
  }
}
