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
  UserCog,
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
      await refresh();
      setOpen(false);
      // Force refresh server components để các route admin hiển thị lại gate.
      router.refresh();
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
            <Link
              href={`/login?next=${encodeURIComponent(pathname)}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
            >
              <UserCog className="h-4 w-4" />
              {isLoggedIn ? "Đăng nhập nhân viên khác" : "Đăng nhập nhân viên"}
            </Link>
            {isLoggedIn && (
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
            )}
            {!isLoggedIn && (
              <Link
                href="/login?next=/thong-bao-zalo"
                onClick={() => setOpen(false)}
                className="mt-0.5 flex items-center gap-2 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 px-3 py-2 text-sm font-bold text-white hover:opacity-90"
              >
                <LogIn className="h-4 w-4" />
                Đăng nhập ngay để dùng Zalo
              </Link>
            )}
          </div>

          {/* Hint */}
          <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            {isLoggedIn ? (
              <>
                Cookie <code className="font-mono">current_staff_id</code> có hiệu lực 30 ngày.
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