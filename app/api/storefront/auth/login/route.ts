import { NextResponse } from "next/server";
import { z } from "zod";
import { loginCustomer, setSessionCookie, toPublicCustomer } from "@/lib/customers/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  phone: z.string().min(1, "Vui lòng nhập số điện thoại."),
  password: z.string().min(1, "Vui lòng nhập mật khẩu."),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." },
        { status: 400 }
      );
    }
    const userAgent = request.headers.get("user-agent");
    const { customer, token } = await loginCustomer(parsed.data, userAgent);
    await setSessionCookie(token);
    return NextResponse.json({ customer: toPublicCustomer(customer) });
  } catch (error) {
    console.error("POST /api/storefront/auth/login failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Đăng nhập thất bại." },
      { status: 401 }
    );
  }
}
