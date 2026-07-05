"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Download, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import ZaloAccountSwitcher from "@/components/zalo/ZaloAccountSwitcher";
import { zaloAuthApi } from "@/lib/zalo-api";

const ZaloPageContent = dynamic(
  () => import("@/components/zalo/ZaloPageContent").then((m) => m.ZaloPageContent),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center p-8 text-sm text-slate-500">
        Đang tải Zalo...
      </div>
    ),
  }
);

/**
 * URL chia sẻ extension Zalo (Google Drive preview). Trỏ thẳng tới endpoint
 * `export=download` của Drive để trình duyệt tải file .rar ngay khi user bấm
 * thay vì mở trang preview Google Drive. Sau khi tải, user giải nén và
 * `chrome://extensions` → "Load unpacked" trỏ vào thư mục vừa giải nén.
 */
const ZALO_EXTENSION_DOWNLOAD_URL =
  "https://drive.google.com/uc?export=download&id=1f8e3HQzcxICu9RMYpvYWGWvwV2Jn5VBJ";

/**
 * Trang thông báo Zalo — yêu cầu đăng nhập nhân viên (Phase 3).
 *
 * Nếu user chưa có cookie `current_staff_id` → hiển thị màn hình "Vui lòng
 * đăng nhập" với nút bấm dẫn tới /login. Backward compat: nếu BE fallback
 * admin (system role) mà user CHƯA đăng nhập thật sự, vẫn hiển thị gate.
 *
 * Sau khi login xong, browser refresh session → useEffect pick up cookie mới
 * và load ZaloPageContent. Tránh hard reload để giữ scroll + state khác.
 */
export default function ZaloPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [authState, setAuthState] = useState<
    "loading" | "needs_login" | "logged_in"
  >("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await zaloAuthApi.me();
        if (cancelled) return;
        if (res.has_session && (res.staff?.role === "admin" || res.staff?.role === "staff")) {
          setAuthState("logged_in");
        } else {
          setAuthState("needs_login");
        }
      } catch {
        if (!cancelled) setAuthState("needs_login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div className="flex h-screen flex-col p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h1 className="text-sm font-semibold text-slate-700">
          Thông báo Zalo
        </h1>
        <div className="flex items-center gap-2">
          <a
            href={ZALO_EXTENSION_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            download="extension-login-zalo.rar"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            title="Tải extension Chrome đăng nhập Zalo về máy"
          >
            <Download className="h-3.5 w-3.5" />
            Tải extension
          </a>
          <ZaloAccountSwitcher />
        </div>
      </div>

      {authState === "loading" && (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Đang kiểm tra đăng nhập…
        </div>
      )}

      {authState === "needs_login" && (
        <div className="grid flex-1 place-items-center">
          <div className="w-full max-w-md rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-lg">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="text-base font-bold text-amber-900">
              Cần đăng nhập để dùng Zalo
            </div>
            <div className="mt-1 text-xs text-amber-800">
              Đăng nhập để phân biệt tài khoản Zalo của bạn, đồng bộ hội thoại về Supabase và nhận tin nhắn realtime phân biệt theo nhân viên.
            </div>
            <button
              type="button"
              onClick={() => router.push(`/login?next=${encodeURIComponent(pathname)}`)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700"
            >
              <MessageCircle className="h-4 w-4" />
              Đăng nhập nhân viên
            </button>
            <div className="mt-4 border-t border-amber-200/70 pt-3 text-left text-[11px] leading-5 text-amber-800">
              <div className="font-semibold uppercase tracking-wide text-amber-700">
                Chưa cài extension Chrome?
              </div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>
                  Bấm{" "}
                  <a
                    href={ZALO_EXTENSION_DOWNLOAD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    download="extension-login-zalo.rar"
                    className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
                  >
                    Tải extension
                  </a>{" "}
                  về máy và giải nén.
                </li>
                <li>
                  Mở <code className="rounded bg-amber-100 px-1">chrome://extensions</code>,
                  bật <em>Developer mode</em>, bấm <strong>Load unpacked</strong>{" "}
                  rồi trỏ vào thư mục vừa giải nén.
                </li>
                <li>Quay lại trang này, bấm "Đăng nhập nhân viên" để tiếp tục.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {authState === "logged_in" && <ZaloPageContent />}
    </div>
  );
}