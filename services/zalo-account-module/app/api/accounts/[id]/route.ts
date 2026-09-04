/**
 * GET    /api/accounts/[id]
 * PUT    /api/accounts/[id]
 * DELETE /api/accounts/[id]
 *
 * Ported từ app/api/zalo/accounts/[id]/route.ts (app chính). Proxy tới
 * zalo-bridge — chỉ admin mới được PUT/DELETE.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff, canViewAccount } from "@/lib/zaloAuth";
import { bridgeFetch } from "@/lib/bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function paramName(id: string): string | null {
  return /^[a-zA-Z0-9_.-]{1,64}$/.test(id) ? id : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!paramName(id)) return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });
  const staff = await getCurrentStaff(req);
  if (!canViewAccount(staff, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const res = await bridgeFetch(`/auth/accounts/${id}`);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err?.message ?? "Bridge unreachable" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!paramName(id)) return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });
  const staff = await getCurrentStaff(req);
  if (staff.role !== "admin") {
    return NextResponse.json({ error: "Chỉ admin mới được cập nhật tài khoản" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const res = await bridgeFetch(`/auth/accounts/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!paramName(id)) return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });
  const staff = await getCurrentStaff(req);
  if (staff.role !== "admin") {
    return NextResponse.json({ error: "Chỉ admin mới được xoá tài khoản" }, { status: 403 });
  }
  try {
    const res = await bridgeFetch(`/auth/accounts/${id}`, { method: "DELETE" });
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
