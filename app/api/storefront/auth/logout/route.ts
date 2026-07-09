import { NextResponse } from "next/server";
import { clearSessionCookie, deleteSessionToken, getSessionTokenFromCookies } from "@/lib/customers/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const token = await getSessionTokenFromCookies();
  if (token) await deleteSessionToken(token);
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
