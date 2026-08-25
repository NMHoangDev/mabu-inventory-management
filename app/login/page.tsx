"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, Lock, LogIn, Mail, MessageCircle } from "lucide-react";
import { zaloAuthApi, type CurrentStaff } from "@/lib/zalo-api";

/**
 * Trang đăng nhập nhân viên (staff login).
 * ──────────────────────────────────────────────────────────────────────────
 * Nhập email + mật khẩu trực tiếp — KHÔNG hiển thị danh sách toàn bộ nhân
 * viên để chọn (trước đây là 1 danh sách card bấm chọn tên rồi mới nhập mật
 * khẩu — dễ gây hiểu lầm "ai cũng đăng nhập được vào tài khoản người khác"
 * và lộ email/tên toàn bộ nhân viên cho bất kỳ ai mở trang login).
 *
 *   1) Xác thực thật ở POST /api/auth/zalo/me { email, password } — lần đầu
 *      đăng nhập cho 1 tài khoản sẽ set mật khẩu vừa nhập làm mật khẩu chính
 *      thức (bootstrap).
 *   2) Cookie `current_staff_id` được set sau khi verify thành công — MỌI
 *      quyền hạn sau đó (nav, API, module) đều tra theo ĐÚNG staff id này
 *      (xem lib/auth/permissions.ts) — đăng nhập tài khoản nào thì có đúng
 *      quyền của tài khoản đó, không lẫn giữa các tài khoản.
 *   3) Sau khi login, redirect về `?next=<path>` (mặc định /products/inventory).
 *   4) Nếu đã có session hợp lệ mà vẫn mở /login (vd gõ thẳng URL, bookmark
 *      cũ) → tự redirect sang thẳng đích ngay, không hiện lại form/thông báo
 *      gì — muốn đăng nhập tài khoản khác thì bấm "Đăng xuất" ở badge nhân
 *      viên trước.
 *
 * Cookie không HttpOnly (client đọc được) để UI biết user hiện tại.
 */
export default function ZaloLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      }
    >
      <ZaloLoginPageInner />
    </Suspense>
  );
}

function ZaloLoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/products/inventory";

  const [current, setCurrent] = useState<CurrentStaff | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoggedIn = !!current && current.role !== "system";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await zaloAuthApi.me();
        if (!cancelled) setCurrent(me.staff);
      } catch {
        // Chưa đăng nhập — bỏ qua, form vẫn hiển thị bình thường.
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Đã có session hợp lệ → khỏi hiện lại trang login, đi thẳng vào app.
  useEffect(() => {
    if (!checkingSession && isLoggedIn) {
      router.replace(nextPath);
    }
  }, [checkingSession, isLoggedIn, nextPath, router]);

  async function handleSubmit() {
    if (!email.trim() || password.length < 4) return;
    setSubmitting(true);
    setError(null);
    try {
      await zaloAuthApi.login(email.trim(), password);
      router.replace(nextPath);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đăng nhập thất bại.");
      setSubmitting(false);
    }
  }

  // Đang kiểm tra session hoặc đã login (sắp redirect) → chỉ hiện spinner,
  // không flash form đăng nhập rồi lại biến mất.
  if (checkingSession || isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg">
            <MessageCircle className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Đăng nhập</h1>
          <p className="mt-1 text-sm text-slate-600">Nhập email và mật khẩu tài khoản nhân viên của bạn.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {error ? (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="space-y-3"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ten@congty.com"
                  className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Mật khẩu</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                Lần đầu đăng nhập cho tài khoản này? Mật khẩu bạn nhập sẽ được lưu làm mật khẩu chính thức.
              </p>
            </div>
            <button
              type="submit"
              disabled={submitting || !email.trim() || password.length < 4}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Đăng nhập
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
