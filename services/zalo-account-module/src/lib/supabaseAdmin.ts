/**
 * Supabase config dùng chung cho cả module.
 *
 * Một số route port nguyên văn từ app chính dùng `@supabase/supabase-js`
 * client (vd zaloAuth.ts), một số khác dùng raw REST fetch trực tiếp (vd
 * các route /api/staff/*, giống hệt cách file gốc app/api/zalo/staff/*
 * làm) — export cả hai kiểu ở đây để mỗi route port giữ đúng phong cách gốc
 * của nó.
 */

import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";

export const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

/**
 * Client `@supabase/supabase-js` đã cấu hình sẵn service-role (fallback
 * anon) key. `persistSession: false` vì đây là server-side only, không có
 * browser session nào để lưu.
 */
export const supabaseAdmin = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_KEY || "placeholder-key",
  { auth: { persistSession: false } }
);

/**
 * Helper raw REST fetch tới Supabase PostgREST — dùng cho các route port
 * nguyên văn từ app chính vốn không dùng JS client (vd staff/assign,
 * staff/route.ts).
 */
export function sb(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(init?.headers ?? {})
    }
  });
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}
