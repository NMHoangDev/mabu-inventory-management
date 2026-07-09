import { NextResponse } from "next/server";
import { z } from "zod";
import { registerCustomer, setSessionCookie, toPublicCustomer } from "@/lib/customers/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(1, "Vui lòng nhập họ tên."),
  phone: z.string().min(8, "Số điện thoại không hợp lệ."),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự."),
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
    const { customer, token } = await registerCustomer(parsed.data, userAgent);
    await setSessionCookie(token);
    return NextResponse.json({ customer: toPublicCustomer(customer) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/storefront/auth/register failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Đăng ký thất bại." },
      { status: 400 }
    );
  }
}
