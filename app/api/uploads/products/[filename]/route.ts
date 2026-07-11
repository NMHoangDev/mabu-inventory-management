import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataDir =
  process.env.INVOICEFLOW_DATA_DIR ??
  (process.env.VERCEL ? path.join(os.tmpdir(), "invoiceflow") : path.join(process.cwd(), "data"));
const uploadsDir = path.join(dataDir, "uploads", "products");

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif"
};

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  try {
    const { filename } = await context.params;
    // Chặn path traversal — chỉ cho phép tên file phẳng (uuid.ext do chính
    // POST /api/uploads/products sinh ra, không chứa "/" hay "..").
    if (!filename || filename.includes("/") || filename.includes("..")) {
      return NextResponse.json({ error: "Tên file không hợp lệ." }, { status: 400 });
    }
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
      return NextResponse.json({ error: "Loại file không hỗ trợ." }, { status: 400 });
    }
    const filePath = path.join(uploadsDir, filename);
    const buffer = await fs.readFile(filePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: "Không tìm thấy ảnh." }, { status: 404 });
  }
}
