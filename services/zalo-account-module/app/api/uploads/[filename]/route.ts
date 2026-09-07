/**
 * GET /api/uploads/<filename> — serve ảnh đã upload (xem app/api/uploads/route.ts).
 * Không yêu cầu đăng nhập (route nằm dưới /api, middleware.ts loại trừ toàn
 * bộ /api) — bridge (server-side, khác container) cần fetch được mà không có
 * cookie session; ảnh không nhạy cảm nên chấp nhận đánh đổi này.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = "/app/uploads";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ filename: string }> }) {
  const { filename } = await ctx.params;
  // Chặn path traversal — chỉ chấp nhận tên file phẳng do route upload sinh ra.
  if (!filename || filename.includes("/") || filename.includes("..")) {
    return NextResponse.json({ error: "invalid filename" }, { status: 400 });
  }
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const contentType = MIME[ext];
  if (!contentType) return NextResponse.json({ error: "unsupported file type" }, { status: 400 });

  try {
    const buffer = await readFile(path.join(UPLOAD_DIR, filename));
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
