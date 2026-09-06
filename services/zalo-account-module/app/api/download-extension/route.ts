/**
 * Tải extension qua route (kèm Content-Disposition: attachment tường minh).
 *
 * GIỮ LẠI route này kể cả khi nút bấm trỏ thẳng vào /extension-login-zalo.zip:
 * trình duyệt user có thể còn cache bản trang cũ trỏ vào đây — nếu route biến
 * mất thì click đó ăn 404, Chrome báo "Không thấy tệp trên trang"
 * (SERVER_BAD_CONTENT). Mọi đường dẫn từng dùng đều phải sống.
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
