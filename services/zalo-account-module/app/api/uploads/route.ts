/**
 * POST /api/uploads — nhận 1 file ảnh (multipart, field "file"), lưu vào
 * volume Docker persist /app/uploads (KHÔNG nằm trong image, xem
 * docker-compose.yml service zalo-account-module), trả về URL để dùng làm
 * `image_urls` trong bulk job / campaign template.
 *
 * URL trả về là URL NỘI BỘ (http://zalo-account-module:3002/...) — bridge tải
 * ảnh này qua mạng Docker `invoiceflow-net` (server-side, xem
 * downloadImageToTemp() trong services/zalo-bridge/src/routes/zalo-client.js),
 * không cần public-facing, ảnh không bị lộ ra ngoài internet.
 */

import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getCurrentStaff } from "@/lib/zaloAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = "/app/uploads";
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB — ảnh gửi Zalo không cần lớn hơn
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const INTERNAL_BASE_URL = `http://zalo-account-module:${process.env.PORT || 3002}`;

export async function POST(req: NextRequest) {
  const staff = await getCurrentStaff(req);
  if (!staff.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing file (multipart field 'file')" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `unsupported type: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: `file too large (max ${MAX_SIZE_BYTES / 1024 / 1024}MB)` }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
  const filename = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  // `url` (tuyệt đối, hostname nội bộ Docker) là giá trị LƯU VÀO DB — worker/
  // bridge dùng để tải ảnh. `previewUrl` (tương đối) chỉ để trình duyệt hiển
  // thị ngay trong lúc soạn — hostname nội bộ không resolve được từ máy người
  // dùng, nhưng đường dẫn tương đối thì luôn cùng-origin với trang đang mở.
  return NextResponse.json({
    ok: true,
    url: `${INTERNAL_BASE_URL}/api/uploads/${filename}`,
    previewUrl: `/api/uploads/${filename}`,
    filename,
  });
}
