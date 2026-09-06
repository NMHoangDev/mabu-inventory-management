"use client";

/**
 * Login độc lập của module — email+password (bootstrap ở lần đăng nhập đầu,
 * xem app/api/auth/login/route.ts) + Đăng nhập Google (xem
 * app/api/auth/google/route.ts, GoogleSignInButton.tsx) — cả 2 cách đều check
 * theo bảng `staff`, cùng dẫn tới 1 session (cookie current_staff_id).
 *
 * Bố cục 2 cột (form bên trái, panel giới thiệu bên phải, panel ẩn dưới lg)
 * học theo trang auth của webapp merkeeai (qua zalo-account-module).
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, Loader2, Lock, LogIn, Mail, Send, ShieldCheck } from "lucide-react";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { alert, btn, btnSize, inputWithIcon, label } from "@/lib/ui";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}

const HIGHLIGHTS = [
  "Tự động chuyển tiếp tin nhắn từ 1 nhóm chính sang nhiều nhóm đích",
  "Hỗ trợ mọi loại tin: văn bản, ảnh, file, sticker, tag @All",
  "Theo dõi lịch sử chuyển tiếp theo từng luật, từng nhóm đích"
];

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";

  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/login", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && data?.has_session) {
          router.replace(nextPath);
          return;
        }
      } catch {
        // chưa đăng nhập — hiện form bình thường
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nextPath, router]);

  async function handleSubmit() {
    if (!email.trim() || password.length < 4) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: "include"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      router.replace(nextPath);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đăng nhập thất bại.");
      setSubmitting(false);
    }
  }

  function handleGoogleSuccess() {
    setError(null);
    router.replace(nextPath);
    router.refresh();
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white">
      <div className="flex w-full flex-col justify-center px-6 py-10 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm space-y-6">
          <div>
            <div className="mb-5 inline-grid h-11 w-11 place-items-center rounded-xl bg-brand text-white">
              <Send className="h-[22px] w-[22px]" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Đăng nhập</h1>
            <p className="mt-1.5 text-sm text-slate-500">Chuyển tiếp Zalo — InvoiceFlow Manager</p>
          </div>

          {error ? (
            <div className={alert.error}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <GoogleSignInButton onSuccess={handleGoogleSuccess} onError={setError} />

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400">hoặc dùng mật khẩu</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="space-y-4"
          >
            <div>
              <label className={label} htmlFor="login-email">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ten@congty.com"
                  className={inputWithIcon}
                />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="login-password">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className={inputWithIcon}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                Lần đầu đăng nhập cho tài khoản này? Mật khẩu bạn nhập sẽ được lưu làm mật khẩu chính thức.
              </p>
            </div>
            <button
              type="submit"
              disabled={submitting || !email.trim() || password.length < 4}
              className={`${btn.primary} ${btnSize.lg} w-full`}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Đăng nhập
            </button>
          </form>
        </div>
      </div>

      <div className="hidden border-l border-slate-200 bg-slate-50 lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:px-16">
        <div className="max-w-md">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-3 py-1 text-xs font-semibold text-brand-dark ring-1 ring-inset ring-brand-border">
            <ShieldCheck className="h-3.5 w-3.5" />
            Chỉ Gmail được admin cấp quyền
          </div>
          <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
            Chuyển tiếp tin nhắn Zalo tự động, không bỏ sót
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Chọn 1 nhóm chính, mọi tin nhắn gửi trong nhóm đó tự động chuyển tiếp sang các nhóm đích —
            không cần trực Zalo Web để copy/paste thủ công.
          </p>
          <ul className="mt-6 space-y-3">
            {HIGHLIGHTS.map((text) => (
              <li key={text} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand">
                  <Check className="h-3 w-3" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
