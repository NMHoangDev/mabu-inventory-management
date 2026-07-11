import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cùng convention với lib/products/repository.ts (dataDir): mặc định
// process.cwd()/data — trong container production đây chính là /app/data,
// đã có volume `frontend-data` mount riêng nên ảnh sống sót qua các lần
// rebuild/redeploy (không như /app/public, bị ghi đè bởi image mới).
const dataDir =
  process.env.INVOICEFLOW_DATA_DIR ??
  (process.env.VERCEL ? path.join(os.tmpdir(), "invoiceflow") : path.join(process.cwd(), "data"));
const uploadsDir = path.join(dataDir, "uploads", "products");

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file ảnh." }, { status: 400 });
    }
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: "Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF." },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Ảnh vượt quá 10MB." }, { status: 400 });
    }

    await fs.mkdir(uploadsDir, { recursive: true });
    const filename = `${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(uploadsDir, filename), buffer);

    return NextResponse.json({ url: `/api/uploads/products/${filename}` }, { status: 201 });
  } catch (error) {
    console.error("POST /api/uploads/products failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải lên được ảnh." },
      { status: 500 }
    );
  }
}
