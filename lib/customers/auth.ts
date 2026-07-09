/**
 * lib/customers/auth.ts — auth khách hàng cho storefront, xem STOREFRONT_PLAN.md
 * mục 3. KHÔNG dùng lại pattern cookie=UUID trần của staff (lib/zalo/auth.ts) —
 * storefront đối diện internet trực tiếp nên cookie chỉ lưu 1 token ngẫu nhiên,
 * server tra `customer_sessions.token_hash` (sha256) để xác định khách.
 */

import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { getPool, isDatabaseConfigured } from "../db/connection";
import { ensureDatabase } from "../db/migration";
import { hashPassword, verifyPassword } from "../auth/password";
import { createCustomer, getCustomerById, type Customer } from "./repository";

export const CUSTOMER_SESSION_COOKIE = "customer_session";
const SESSION_DAYS = 30;

export interface PublicCustomer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
}

// Customer.password_hash không có trong type Customer nhưng `select c.*` ở
// repository vẫn trả về field này trên object thật — PHẢI dùng hàm này ở mọi
// nơi trả dữ liệu khách hàng ra API công khai, không bao giờ NextResponse.json
// trực tiếp object Customer thô.
export function toPublicCustomer(row: Customer): PublicCustomer {
  return { id: row.id, code: row.code, name: row.name, phone: row.phone ?? "", email: row.email ?? "" };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createSession(customerId: string, userAgent?: string | null): Promise<string> {
  await ensureDatabase();
  const pool = getPool();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    `insert into customer_sessions (customer_id, token_hash, user_agent, expires_at) values ($1,$2,$3,$4)`,
    [customerId, hashToken(token), userAgent ?? null, expiresAt.toISOString()]
  );
  return token;
}

export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token || !isDatabaseConfigured) return null;
  await ensureDatabase();
  const pool = getPool();
  const res = await pool.query(
    `select customer_id from customer_sessions where token_hash = $1 and expires_at > now()`,
    [hashToken(token)]
  );
  return res.rows[0]?.customer_id ?? null;
}

export async function deleteSessionToken(token: string): Promise<void> {
  if (!isDatabaseConfigured) return;
  await ensureDatabase();
  await getPool().query(`delete from customer_sessions where token_hash = $1`, [hashToken(token)]);
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(CUSTOMER_SESSION_COOKIE);
}

export async function getSessionTokenFromCookies(): Promise<string | null> {
  const store = await cookies();
  return store.get(CUSTOMER_SESSION_COOKIE)?.value ?? null;
}

export async function getCurrentCustomer(): Promise<Customer | null> {
  const token = await getSessionTokenFromCookies();
  const customerId = await verifySessionToken(token);
  if (!customerId) return null;
  return getCustomerById(customerId);
}

export interface RegisterInput {
  name: string;
  phone: string;
  email?: string;
  password: string;
}

export async function registerCustomer(
  input: RegisterInput,
  userAgent?: string | null
): Promise<{ customer: Customer; token: string }> {
  if (!isDatabaseConfigured) throw new Error("Database chưa cấu hình.");
  await ensureDatabase();
  const pool = getPool();
  const phone = input.phone.trim();
  if (!phone) throw new Error("Số điện thoại là bắt buộc.");
  if (!input.password || input.password.length < 6) throw new Error("Mật khẩu phải có ít nhất 6 ký tự.");

  const existing = await pool.query(`select id, password_hash from customers where phone = $1 limit 1`, [phone]);
  const passwordHash = hashPassword(input.password);

  let customerId: string;
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (row.password_hash) {
      throw new Error("Số điện thoại này đã có tài khoản. Vui lòng đăng nhập.");
    }
    // Khách đã tồn tại trong hệ thống (nhân viên tạo trước đó khi mua tại
    // cửa hàng, chưa từng đăng ký web) — gắn mật khẩu vào đúng hồ sơ cũ để
    // giữ nguyên lịch sử đơn hàng/tổng chi tiêu, không tạo khách trùng lặp.
    customerId = row.id;
    await pool.query(
      `update customers set password_hash = $2, email = coalesce(nullif(email, ''), $3), updated_at = now() where id = $1`,
      [customerId, passwordHash, input.email ?? ""]
    );
  } else {
    const customer = await createCustomer({ name: input.name.trim() || phone, phone, email: input.email });
    customerId = customer.id;
    await pool.query(`update customers set password_hash = $2 where id = $1`, [customerId, passwordHash]);
  }

  const token = await createSession(customerId, userAgent);
  const customer = await getCustomerById(customerId);
  return { customer: customer!, token };
}

export interface LoginInput {
  phone: string;
  password: string;
}

export async function loginCustomer(
  input: LoginInput,
  userAgent?: string | null
): Promise<{ customer: Customer; token: string }> {
  if (!isDatabaseConfigured) throw new Error("Database chưa cấu hình.");
  await ensureDatabase();
  const pool = getPool();
  const phone = input.phone.trim();
  const res = await pool.query(`select id, password_hash from customers where phone = $1 limit 1`, [phone]);
  const row = res.rows[0];
  // Cùng thông báo cho cả 2 trường hợp (không tồn tại / sai mật khẩu) để
  // tránh lộ thông tin số điện thoại nào đã đăng ký (user enumeration).
  if (!row || !row.password_hash || !verifyPassword(input.password, row.password_hash)) {
    throw new Error("Số điện thoại hoặc mật khẩu không đúng.");
  }
  const token = await createSession(row.id, userAgent);
  const customer = await getCustomerById(row.id);
  return { customer: customer!, token };
}
