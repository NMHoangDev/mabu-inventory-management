/**
 * Proxy `/zalo-bridge/*` → zalo-bridge (mạng nội bộ Docker, ZALO_BRIDGE_URL).
 *
 * Vì sao cần: client (src/lib/zaloApiClient.ts) gọi bridge THẲNG từ browser qua
 * NEXT_PUBLIC_ZALO_BRIDGE_URL=/zalo-bridge (đường dẫn tương đối, cùng origin để
 * không vướng CORS/mixed-content khi module đứng sau HTTPS domain). Trước đây
 * prefix này chỉ được nginx `router` (:8080) forward, nên nếu domain trỏ thẳng
 * vào port module (:3002) thì mọi call /zalo-bridge/* rơi vào Next.js và bị
 * middleware đá về /login → trang chat chết. Có route này thì module tự lo,
 * hoạt động cả khi domain trỏ :3002, qua router :8080, hay gọi bằng IP thuần.
 *
 * Bridge nhận cả path gốc và path có prefix (xem services/zalo-bridge/src/index.js)
 * — ở đây strip prefix, forward về path gốc.
 *
 * Body và response đều đi dạng STREAM (không đọc hết vào RAM) để SSE
 * (/api/all-platform/zalo/events) đẩy event tới browser ngay khi bridge phát,
 * và upload ảnh/file không bị gãy.
 */

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";

const BRIDGE_URL = (process.env.ZALO_BRIDGE_URL || "http://zalo-bridge:3001").replace(/\/+$/, "");

// Header do runtime/hop tự quản — forward tiếp sẽ sai hoặc bị undici từ chối.
const SKIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
  "expect"
]);

const SKIP_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${BRIDGE_URL}/${(path || []).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!SKIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // undici bắt buộc khi body là stream
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      cache: "no-store"
    } as RequestInit);
  } catch (e) {
    return Response.json(
      { error: "bridge_unreachable", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }

  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) resHeaders.set(key, value);
  });
  // Chặn mọi tầng cache/buffer giữa đường với SSE.
  if ((upstream.headers.get("content-type") || "").includes("text/event-stream")) {
    resHeaders.set("Cache-Control", "no-cache, no-transform");
    resHeaders.set("X-Accel-Buffering", "no");
  }

  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: resHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
