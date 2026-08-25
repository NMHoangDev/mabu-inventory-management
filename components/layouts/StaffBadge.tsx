"use client";

/**
 * StaffBadge — hiển thị nhân viên đang đăng nhập + menu nhanh.
 * ──────────────────────────────────────────────────────────────────────────
 * Đặt ở header dashboard. Fetch session qua /api/auth/zalo/me mỗi 60s + mỗi
 * khi user thao tác (focus window, route change). Click vào badge → menu:
 *   - Tên + email + role hiện tại
 *   - Link "Đăng nhập nhân viên khác" → /login
 *   - Nút "Đăng xuất"
 *
 * Khi CHƯA có session (role=system) → badge vàng + nút "Đăng nhập ngay".
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  Loader2,
  LogIn,
  LogOut,
  ShieldCheck,
  Users
} from "lucide-react";
import { zaloAuthApi, type CurrentStaff } from "@/lib/zalo-api";

const REFRESH_MS = 60_000;

export default function StaffBadge() {
  const router = useRouter();
  const pathname = usePathname();
  const [staff, setStaff] = useState<CurrentStaff | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  async function refresh() {
    try {
      const res = await zaloAuthApi.me();
      setStaff(res.staff);
      setHasSession(res.has_session);
      // Session hết hạn/bị vô hiệu hoá NGAY TRONG LÚC tab đang mở (cookie
      // current_staff_id tự hết hạn sau 7 ngày, hoặc bị đăng xuất/khoá từ
      // nơi khác) — middleware chỉ chặn được ở request/navigation KẾ TIẾP,
      // không tự đẩy user đang đứng yên trên 1 trang ra /login. Poll 60s +
      // mỗi lần focus window ở đây để bắt được ngay, không cần đợi họ tự bấm
      // gì hoặc chuyển trang mới nhận ra đã mất session.
      if (!res.has_session) {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
      }
    } catch {
      setStaff({
        id: null,
        email: "",
        full_name: "Chưa đăng nhập",
        role: "system",
        assignments: []
      });
      setHasSession(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, REFRESH_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Click outside close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function handleLogout() {
    setBusy(true);
    try {
      await zaloAuthApi.logout();
      setOpen(false);
      // refresh() sẽ thấy has_session=false → tự router.push('/login') luôn,
      // không cần gọi router.refresh() riêng nữa.
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const initials = (() => {
    const name = staff?.full_name || staff?.email || "?";
    return name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("");
  })();

  const isLoggedIn = hasSession && (staff?.role === "admin" || staff?.role === "staff");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`group flex items-center gap-2 rounded-full border bg-card px-1.5 py-1 pr-3 shadow-sm transition ${
          isLoggedIn
            ? "border-emerald-200 hover:border-emerald-400"
            : "border-amber-300 bg-amber-50 hover:border-amber-500"
        }`}
        aria-label="Tài khoản nhân viên"
      >
        <div
          className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white shadow-sm ${
            isLoggedIn
              ? "bg-gradient-to-br from-blue-500 to-indigo-600"
              : "bg-gradient-to-br from-amber-500 to-amber-700"
          }`}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : initials || "?"}
        </div>
        <div className="hidden text-left text-[11px] leading-tight md:block">
          <div className="max-w-[8rem] truncate font-semibold text-slate-700">
            {staff?.full_name || (isLoggedIn ? "" : "Chưa đăng nhập")}
          </div>
          <div
            className={`text-[10px] ${
              staff?.role === "admin"
                ? "font-semibold text-blue-600"
                : staff?.role === "staff"
                  ? "text-slate-500"
                  : "text-amber-700"
            }`}
          >
            {staff?.role === "admin"
              ? "Quản trị viên"
              : staff?.role === "staff"
                ? staff.assignments.length > 0
                  ? `${staff.assignments.length} TK Zalo`
                  : "Nhân viên"
                : "Bấm để đăng nhập"}
          </div>
        </div>
        <ChevronDown
          className={`h-3 w-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {/* Header */}
          <div className="border-b border-slate-100 bg-gradient-to-br from-blue-50 to-indigo-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-sm">
                {initials || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-slate-900">
                  {staff?.full_name || "Chưa đăng nhập"}
                </div>
                <div className="truncate text-xs text-slate-500" title={staff?.email}>
                  {staff?.email || "—"}
                </div>
                {staff?.role === "admin" ? (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                    <ShieldCheck className="h-3 w-3" />
                    Quản trị viên (full quyền)
                  </span>
                ) : staff?.role === "staff" ? (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <Users className="h-3 w-3" />
                    Nhân viên · {staff.assignments.length} TK Zalo
                  </span>
                ) : (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                    Chưa đăng nhập
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-1.5">
            {isLoggedIn ? (
              // Trang /login giờ tự redirect đi luôn nếu đang có session hợp
              // lệ (xem app/login/page.tsx) — nên "đăng nhập tài khoản khác"
              // phải đăng xuất trước, KHÔNG thể chỉ điều hướng sang /login
              // như trước (sẽ bị bounce ngược lại ngay).
              <button
                type="button"
                onClick={handleLogout}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Đăng xuất
              </button>
            ) : (
              <Link
                href={`/login?next=${encodeURIComponent(pathname)}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 px-3 py-2 text-sm font-bold text-white hover:opacity-90"
              >
                <LogIn className="h-4 w-4" />
                Đăng nhập ngay
              </Link>
            )}
          </div>

          {/* Hint */}
          <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            {isLoggedIn ? (
              <>
                Cookie <code className="font-mono">current_staff_id</code> có hiệu lực 7 ngày.
              </>
            ) : (
              <>
                Đăng nhập để xem conversations Zalo được phân quyền.
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}