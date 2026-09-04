/**
 * POST /api/accounts/[id]/reconnect
 *
 * Route MỚI, không có trong app chính. Proxy tới bridge
 * `POST /auth/reconnect` với body { account_id }. Yêu cầu canSendToAccount
 * hoặc admin (không mở public — reconnect có thể ảnh hưởng session Zalo
 * thật đang sống).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff, canSendToAccount } from "@/lib/zaloAuth";
import { bridgeFetch } from "@/lib/bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function paramName(id: string): string | null {
  return /^[a-zA-Z0-9_.-]{1,64}$/.test(id) ? id : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!paramName(id)) return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });

  const staff = await getCurrentStaff(req);
  if (staff.role !== "admin" && !canSendToAccount(staff, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const res = await bridgeFetch("/auth/reconnect", {
      method: "POST",
      body: JSON.stringify({ account_id: id })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error ?? `bridge ${res.status}` }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err?.message ?? "Bridge unreachable" }, { status: 500 });
  }
}
