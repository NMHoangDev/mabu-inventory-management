/**
 * GET /api/health — dùng cho Docker HEALTHCHECK (Dockerfile được thêm sau,
 * không thuộc phạm vi task này).
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
