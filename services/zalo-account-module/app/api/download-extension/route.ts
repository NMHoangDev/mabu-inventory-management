/**
 * Serve extension-login-zalo.zip qua route thay vì link tĩnh /extension-login-zalo.zip
 * trực tiếp — buộc Content-Disposition: attachment tường minh, tránh phụ thuộc
 * vào thuộc tính HTML `download` (một số trình duyệt/tình huống bỏ qua nó và
 * cố NAVIGATE/preview thay vì tải file, gây lỗi "không tìm thấy tệp"/tải hỏng).
 */
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const filePath = path.join(process.cwd(), "public", "extension-login-zalo.zip");
  const buf = await readFile(filePath);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="extension-login-zalo.zip"',
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store",
    },
  });
}
